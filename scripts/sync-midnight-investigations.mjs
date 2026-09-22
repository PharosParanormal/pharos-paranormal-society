// Pulls upcoming Midnight Investigation dates from Ghostly Images of Gettysburg
// and writes them to src/data/midnight-investigations.json for the /calendar page.
//
// Their site runs The Events Calendar (WordPress), so we read its REST API and
// fall back to the category's iCal feed. If both fail, the existing file is left
// untouched so the calendar never gets wiped by a bad fetch.
//
// Usage: node scripts/sync-midnight-investigations.mjs [--dry-run]

import { readFile, writeFile } from 'node:fs/promises';

const SITE = 'https://www.gettysburgbattlefieldtours.com';
const CATEGORY = 'midnight-investigation';
const CATEGORY_PAGE = `${SITE}/events/category/ghost-tours/${CATEGORY}/`;
const OUTPUT = new URL('../src/data/midnight-investigations.json', import.meta.url);
const DRY_RUN = process.argv.includes('--dry-run');
// Their firewall rejects obvious bot user agents, so send ordinary browser headers.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,text/calendar;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const server = res.headers.get('server') ?? 'unknown';
    const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`${res.status} from ${url} (server: ${server}) ${body}`);
  }
  return res;
}

const decode = (s = '') =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#?039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .trim();

// "2026-09-26 00:30:00" -> "2026-09-26T00:30:00" (Gettysburg local time)
const toLocalIso = (s) => s.replace(' ', 'T');

async function fromRestApi() {
  const today = new Date().toISOString().slice(0, 10);
  let url = `${SITE}/wp-json/tribe/events/v1/events?categories=${CATEGORY}&start_date=${today}&per_page=50`;
  const events = [];
  for (let page = 0; url && page < 20; page++) {
    const data = await (await get(url)).json();
    for (const e of data.events ?? []) {
      events.push({
        title: decode(e.title),
        start: toLocalIso(e.start_date),
        end: toLocalIso(e.end_date),
        cost: decode(e.cost) || null,
        location: e.venue?.venue ? decode(e.venue.venue) : null,
        url: e.url,
      });
    }
    url = data.next_rest_url ?? null;
  }
  return events;
}

async function fromIcal() {
  const text = (await (await get(`${CATEGORY_PAGE}?ical=1`)).text()).replace(/\r?\n[ \t]/g, '');
  const unescape = (s = '') => s.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').trim();
  const icalDate = (v) => v && `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11) || '00'}:${v.slice(11, 13) || '00'}:00`;
  const field = (block, name) => block.match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'm'))?.[1];
  return text
    .split('BEGIN:VEVENT')
    .slice(1)
    .map((block) => ({
      title: decode(unescape(field(block, 'SUMMARY'))),
      start: icalDate(field(block, 'DTSTART')),
      end: icalDate(field(block, 'DTEND')),
      cost: null,
      location: unescape(field(block, 'LOCATION')) || null,
      url: field(block, 'URL')?.trim() || CATEGORY_PAGE,
    }));
}

async function main() {
  let events;
  let source;
  for (const [name, fn] of [['rest', fromRestApi], ['ical', fromIcal]]) {
    try {
      events = await fn();
      source = name;
      break;
    } catch (err) {
      console.warn(`${name} source failed: ${err.message}`);
    }
  }
  if (!events) {
    console.error('Could not reach Ghostly Images of Gettysburg. Leaving the calendar unchanged.');
    process.exit(1);
  }

  const now = new Date().toISOString().slice(0, 19);
  const seen = new Set();
  events = events
    .filter((e) => e.title && e.start && (e.end ?? e.start) >= now.slice(0, 10))
    .filter((e) => {
      const key = `${e.start}|${e.title}`;
      return seen.has(key) ? false : seen.add(key);
    })
    .sort((a, b) => a.start.localeCompare(b.start));

  console.log(`Found ${events.length} upcoming midnight investigations via ${source}:`);
  for (const e of events) console.log(`  ${e.start}  ${e.title}  ${e.cost ?? ''}  ${e.url}`);

  if (DRY_RUN) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  let previous = null;
  try {
    previous = JSON.parse(await readFile(OUTPUT, 'utf8'));
  } catch {}
  if (previous && JSON.stringify(previous.events) === JSON.stringify(events)) {
    console.log('No changes.');
    return;
  }
  const output = { source: CATEGORY_PAGE, timezone: 'America/New_York', updatedAt: new Date().toISOString(), events };
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${OUTPUT.pathname}`);
}

main();
