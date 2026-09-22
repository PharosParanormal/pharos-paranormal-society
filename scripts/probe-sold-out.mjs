// Temporary diagnostic: look for how Ghostly Images marks an event as sold out.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const SITE = 'https://www.gettysburgbattlefieldtours.com';
const get = async (u) => { const r = await fetch(u, { headers: HEADERS }); return { status: r.status, text: await r.text() }; };
const snip = (html, re, n = 8) => {
  const out = [];
  for (const m of html.matchAll(re)) {
    out.push(html.slice(Math.max(0, m.index - 250), m.index + 250).replace(/\s+/g, ' '));
    if (out.length >= n) break;
  }
  return out;
};

const today = new Date().toISOString().slice(0, 10);
const list = JSON.parse((await get(`${SITE}/wp-json/tribe/events/v1/events?categories=midnight-investigation&start_date=${today}&per_page=50`)).text);
for (const e of list.events.slice(0, 3)) {
  console.log('\n==================', e.start_date, e.title, e.url);
  console.log('REST keys:', Object.keys(e).join(','));
  console.log('cost:', JSON.stringify(e.cost), 'cost_details:', JSON.stringify(e.cost_details), 'website:', e.website);
  for (const k of Object.keys(e)) if (/ticket|stock|capacity|avail|sold|rsvp/i.test(k)) console.log('  ', k, JSON.stringify(e[k]).slice(0, 300));
  const page = await get(e.url);
  console.log('page status', page.status, 'length', page.text.length);
  for (const s of snip(page.text, /sold[ -]?out|out[ -]of[ -]stock|in[ -]stock|availab|tickets? (?:left|remaining)|spots? (?:left|remaining)|add[-_ ]to[-_ ]cart|\bbook now\b|fareharbor|peek\.com|checkfront|bookeo|rezdy|xola|woocommerce|stock/gi, 25)) console.log('  >>', s);
  const links = [...new Set([...page.text.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /product|book|ticket|cart|fareharbor|peek|checkfront|bookeo|rezdy|xola/i.test(h)))];
  console.log('booking-ish links:', links.slice(0, 20));
}
