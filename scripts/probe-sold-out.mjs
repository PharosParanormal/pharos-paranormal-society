// Temporary diagnostic: print Event Tickets availability for each midnight investigation.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Accept: 'application/json',
};
const SITE = 'https://www.gettysburgbattlefieldtours.com';
const getJson = async (u) => (await fetch(u, { headers: HEADERS })).json();

const today = new Date().toISOString().slice(0, 10);
const list = await getJson(`${SITE}/wp-json/tribe/events/v1/events?categories=midnight-investigation&start_date=${today}&per_page=50`);
for (const e of list.events) {
  const t = await getJson(`${SITE}/wp-json/tribe/tickets/v1/tickets?include_post=${e.id}`);
  console.log(`\n### ${e.start_date} ${e.title} (event ${e.id}) tickets=${t.total}`);
  for (const k of t.tickets ?? []) {
    const { tickets: _, ...rest } = k;
    const drop = ['description', 'global_id', 'global_id_lineage', 'rest_url', 'image', 'author', 'iac', 'price_suffix'];
    for (const d of drop) delete rest[d];
    console.log(JSON.stringify(rest));
  }
}
