#!/usr/bin/env node
// Verifies the built site in ./dist the way Netlify will serve it.
//
//   node test.mjs   (or: npm test)   (run npm run build first)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const baseUrl = config.baseUrl.replace(/\/+$/, '');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
};

// ---- minimal Netlify-style static server: pretty URLs, 404.html, _headers

function parseHeaders() {
  const rules = [];
  let current = null;
  for (const line of fs.readFileSync(path.join(DIST, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push((current = { pattern: line.trim(), headers: {} }));
    else {
      const i = line.indexOf(':');
      current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}
const headerRules = parseHeaders();
const matches = (pattern, p) => (pattern.endsWith('*') ? p.startsWith(pattern.slice(0, -1)) : p === pattern);

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const r of headerRules) if (matches(r.pattern, urlPath)) for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);

  const hidden = ['/_headers', '/netlify.toml'];
  let file = path.join(DIST, urlPath);
  if (!file.startsWith(DIST) || hidden.includes(urlPath)) file = null;
  else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!urlPath.endsWith('/')) { res.writeHead(301, { Location: urlPath + '/' }); return res.end(); }
    file = path.join(file, 'index.html');
  }
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(fs.readFileSync(path.join(DIST, '404.html')));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

// ---- tiny test harness

let failures = 0;
let passes = 0;
function check(ok, message) {
  if (ok) passes++;
  else { failures++; console.log(`  ✖ ${message}`); }
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const get = async (p) => {
  const res = await fetch(origin + p, { redirect: 'manual' });
  return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
};

const secrets = cards.flatMap((c) => [c.token, c.media_id, c.poster_id].filter(Boolean));

function checkPrivacyHeaders(res, where) {
  check(res.headers.get('x-robots-tag') === 'noindex, nofollow, noarchive', `${where}: X-Robots-Tag header`);
  check(res.headers.get('referrer-policy') === 'no-referrer', `${where}: Referrer-Policy header`);
}

// ---- card pages

for (const card of cards) {
  const where = `"${card.title}"`;
  console.log(`• ${where}  /c/${card.token}/`);
  const page = await get(`/c/${card.token}/`);
  check(page.status === 200, `${where}: page should load (got ${page.status})`);
  const html = page.body.toString();
  checkPrivacyHeaders(page, where);
  check(html.includes('<meta name="robots" content="noindex, nofollow, noarchive">'), `${where}: robots meta tag`);
  check(html.includes('<meta name="referrer" content="no-referrer">'), `${where}: referrer meta tag`);
  check(!/autoplay/i.test(html), `${where}: no autoplay`);
  check(html.includes('preload="metadata"'), `${where}: preload="metadata"`);

  const noSlash = await get(`/c/${card.token}`);
  check(noSlash.status === 301 && noSlash.headers.get('location') === `/c/${card.token}/`, `${where}: URL without trailing slash should redirect`);

  // Media and poster resolve, from randomized paths
  const srcs = [...html.matchAll(/<(?:source|video)[^>]*?\s(?:src|poster)="([^"]+)"/g)].map((m) => m[1]);
  check(srcs.length === (card.poster ? 2 : 1), `${where}: expected ${card.poster ? 2 : 1} media reference(s), found ${srcs.length}`);
  for (const src of srcs) {
    if (/^https?:/.test(src)) { console.log(`  (external media, not fetched: ${src})`); continue; }
    check(/^\/m\/[A-Za-z0-9_-]{16,}\.[a-z0-9]+$/.test(src), `${where}: media path should be randomized (${src})`);
    const m = await get(src);
    check(m.status === 200, `${where}: media ${src} should resolve (got ${m.status})`);
    checkPrivacyHeaders(m, `${where} media`);
    const original = src.includes(card.poster_id ?? '\0') ? card.poster : card.source;
    if (original && !/^https?:/.test(original)) {
      check(m.body.equals(fs.readFileSync(path.join(ROOT, original))), `${where}: ${src} should match ${original}`);
      check(!src.includes(path.basename(original, path.extname(original))), `${where}: media path leaks original file name`);
    }
  }

  // Links: only website / contact / social, all external, never another card
  const hrefs = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  for (const tag of hrefs) {
    const href = /href="([^"]*)"/.exec(tag)?.[1] ?? '';
    check(/^(https?:|mailto:|tel:)/.test(href), `${where}: link must be website/contact/social only (${href})`);
    check(!href.startsWith(baseUrl) && !href.includes('/c/'), `${where}: must not link to a card page (${href})`);
    check(/rel="noopener noreferrer"/.test(tag), `${where}: link missing rel="noopener noreferrer" (${href})`);
  }
  for (const other of cards.filter((c) => c !== card)) {
    for (const secret of [other.token, other.media_id, other.poster_id].filter(Boolean)) {
      check(!html.includes(secret), `${where}: page mentions another card's token or media (${other.title})`);
    }
  }

  // QR code decodes to exactly this card's URL
  const csv = fs.readFileSync(path.join(ROOT, 'cards-urls.csv'), 'utf8');
  const qrPng = csv.split('\n').find((l) => l.includes(card.token))?.match(/(qr[^,]*\.png)/)?.[1];
  check(qrPng && fs.existsSync(path.join(ROOT, qrPng)), `${where}: QR PNG listed in cards-urls.csv and present`);
  if (qrPng) {
    const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, qrPng)));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    check(decoded?.data === `${baseUrl}/c/${card.token}/`, `${where}: QR should decode to the card URL (got ${decoded?.data})`);
    check(fs.existsSync(path.join(ROOT, qrPng.replace(/\.png$/, '.svg'))), `${where}: QR SVG present`);
  }
}

// ---- root and unknown paths

console.log('• 404s');
const notFoundPaths = ['/', '/index.html', '/c/', '/m/', '/c/not-a-real-token-123456/', '/m/nope.mp3', '/card1.mp3',
  '/sitemap.xml', '/robots.txt', '/assets/', '/media/', '/_headers', '/netlify.toml', '/cards.json', '/cards-urls.csv'];
for (const p of notFoundPaths) {
  const res = await get(p);
  check(res.status === 404, `${p} should be 404 (got ${res.status})`);
  const body = res.body.toString();
  check(body.includes('Nothing answered.'), `${p} should show the 404 page`);
  check(!secrets.some((s) => body.includes(s)), `${p}: 404 page must not reveal any card`);
  check(!/href="\/(c|m)\//.test(body), `${p}: 404 page must not link to cards`);
  checkPrivacyHeaders(res, p);
}

// ---- nothing in dist reveals the card list

console.log('• Output folder');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else files.push(path.relative(DIST, p));
  }
})(DIST);
check(!files.includes('index.html'), 'no index.html at the site root');
check(!files.some((f) => /sitemap|robots\.txt/i.test(f)), 'no sitemap or robots.txt');
for (const f of files.filter((f) => !f.startsWith('c/') && !f.startsWith('m/'))) {
  const text = fs.readFileSync(path.join(DIST, f), 'latin1');
  check(!secrets.some((s) => text.includes(s)), `${f} must not mention any card token or media id`);
}
check(!files.some((f) => /\b(card\d|evp|mommy|placeholder)/i.test(f)), 'no guessable media file names');
check(files.filter((f) => /^c\/[^/]+\/index\.html$/.test(f)).length === cards.length, 'one page per card, nothing else under /c/');

server.close();
console.log(`\n${failures ? '✖' : '✓'} ${passes} checks passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
