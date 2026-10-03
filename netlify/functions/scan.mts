import type { Context, Config } from "@netlify/functions";
import { getStore, getDeployStore } from "@netlify/blobs";

// Records one "scan" (a visit to /links/?src=card) per call.
// One small blob per scan avoids counter race conditions. No IPs or personal data are stored.
const BOT = /bot|crawl|spider|preview|slurp|facebookexternalhit|headless/i;

function scanStore() {
  // Real scans only count in production; deploy previews/tests go to a throwaway store.
  return Netlify.context?.deploy?.context === "production"
    ? getStore("card-scans")
    : getDeployStore("card-scans");
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (BOT.test(req.headers.get("user-agent") || "")) return new Response(null, { status: 204 });

  const src = new URL(req.url).searchParams.get("src") || "card";
  if (src !== "card") return new Response(null, { status: 204 });

  const now = new Date();
  const day = now.toISOString().slice(0, 10); // UTC date
  const key = `${day}/${now.getTime()}-${crypto.randomUUID().slice(0, 8)}`;
  await scanStore().set(key, "1");
  return new Response(null, { status: 204 });
};

export const config: Config = { path: "/api/scan" };
