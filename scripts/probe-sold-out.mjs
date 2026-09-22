// Temporary diagnostic: look for how Ghostly Images marks an event as sold out.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const SITE = 'https://www.gettysburgbattlefieldtours.com';
const get = async (u) => { const r = await fetch(u, { headers: HEADERS }); return { status: r.status, text: await r.text() }; };

const today = new Date().toISOString().slice(0, 10);
const list = JSON.parse((await get(`${SITE}/wp-json/tribe/events/v1/events?categories=midnight-investigation&start_date=${today}&per_page=50`)).text);
for (const e of list.events.slice(0, 3)) {
  console.log('\n######', e.id, e.start_date, e.title);

  for (const u of [
    `${SITE}/wp-json/tribe/tickets/v1/tickets?include_post=${e.id}`,
    `${SITE}/wp-json/tribe/tickets/v1/tickets?event=${e.id}`,
  ]) {
    const r = await get(u);
    console.log('TICKETS API', r.status, u);
    console.log('   ', r.text.replace(/\s+/g, ' ').slice(0, 1500));
  }

  const page = (await get(e.url)).text;
  const body = page.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  // Ticket form markup and embedded data
  for (const m of body.matchAll(/<[^>]*(?:tribe-tickets|tribe-block__tickets|data-available|data-ticket|sold-out|out-of-stock|tickets-item)[^>]*>/gi)) {
    console.log('  TAG', m[0].slice(0, 400));
  }
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const m of text.matchAll(/ticket|sold|available|remaining|capacity|stock|book/gi)) {
    console.log('  TEXT', text.slice(Math.max(0, m.index - 120), m.index + 160));
  }
  for (const m of body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (/available|capacity|stock|sold/i.test(m[1]) && /ticket/i.test(m[1])) console.log('  SCRIPT', m[1].replace(/\s+/g, ' ').slice(0, 800));
  }
}
