import type { Context, Config } from "@netlify/functions";
import { getStore, getDeployStore } from "@netlify/blobs";

// Private stats page: https://pharosparanormal.com/scan-stats?key=YOUR_STATS_KEY
// Set STATS_KEY in Netlify > Project configuration > Environment variables.
function scanStore() {
  return Netlify.context?.deploy?.context === "production"
    ? getStore("card-scans")
    : getDeployStore("card-scans");
}

export default async (req: Request, _context: Context) => {
  const secret = Netlify.env.get("STATS_KEY");
  if (!secret) return new Response("STATS_KEY is not set.", { status: 503 });
  if (new URL(req.url).searchParams.get("key") !== secret) {
    return new Response("Not found", { status: 404 });
  }

  const { blobs } = await scanStore().list();
  const perDay: Record<string, number> = {};
  for (const b of blobs) {
    const day = b.key.split("/")[0];
    perDay[day] = (perDay[day] || 0) + 1;
  }
  const days = Object.keys(perDay).sort().reverse();
  const total = blobs.length;
  const cutoff = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const since = (n: number) => days.filter((d) => d > cutoff(n)).reduce((s, d) => s + perDay[d], 0);
  const today = perDay[new Date().toISOString().slice(0, 10)] || 0;

  const rows = days.map((d) => `<tr><td>${d}</td><td>${perDay[d]}</td></tr>`).join("") ||
    `<tr><td colspan="2">No scans yet.</td></tr>`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Card scans</title>
<style>body{font:16px system-ui;background:#14191b;color:#f1ead6;max-width:480px;margin:24px auto;padding:0 16px}
.g{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.c{background:#1b2427;border:1px solid #2a3a3e;border-radius:12px;padding:14px}
.c b{display:block;font-size:2rem}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{padding:8px;border-bottom:1px solid #2a3a3e;text-align:left}</style>
<h1>Contact card scans</h1><div class="g">
<div class="c"><b>${total}</b>All time</div><div class="c"><b>${today}</b>Today (UTC)</div>
<div class="c"><b>${since(7)}</b>Last 7 days</div><div class="c"><b>${since(30)}</b>Last 30 days</div></div>
<table><tr><th>Date (UTC)</th><th>Scans</th></tr>${rows}</table>
<p style="color:#b9b3a1;font-size:.85rem">Counts opens of the QR link. Bots are filtered; repeat opens in one browser session count once.</p>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
};

export const config: Config = { path: "/scan-stats" };
