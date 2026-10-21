#!/usr/bin/env node
// Builds the hidden trading-card site into ./dist.
//
//   node build.mjs   (or: npm run build)
//
// cards.json is the source of truth. Tokens are generated once, written back
// to cards.json, and never changed afterwards, so printed QR codes keep working.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const CARDS_FILE = path.join(ROOT, 'cards.json');

const TOKEN_BYTES = 16; // 16 bytes -> 22 URL-safe characters (128 bits)
const MEDIA_ID_BYTES = 12; // 12 bytes -> 16 URL-safe characters
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;
const QR_PNG_WIDTH = 1200; // px; 4 in at 300 dpi, 2 in at 600 dpi
const QR_MARGIN = 4; // quiet zone in modules (the QR spec minimum)

const MEDIA_TYPES = {
  '.mp3': 'audio', '.m4a': 'audio', '.aac': 'audio', '.ogg': 'audio', '.oga': 'audio', '.wav': 'audio', '.opus': 'audio',
  '.mp4': 'video', '.m4v': 'video', '.webm': 'video', '.mov': 'video',
};
const MIME = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.wav': 'audio/wav', '.opus': 'audio/ogg', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};
const POSTER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

// ---------------------------------------------------------------- helpers

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const randomId = (bytes) => randomBytes(bytes).toString('base64url');
const isUrl = (s) => /^https?:\/\//i.test(s);

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugify(title) {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card';
}

// "[www.example.com](https://www.example.com)" -> "www.example.com"
function plainText(value) {
  const md = /^\s*\[([^\]]+)\]\([^)]*\)\s*$/.exec(value || '');
  return md ? md[1] : (value || '');
}

function paragraphs(text) {
  return String(text).trim().split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('\n');
}

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// ---------------------------------------------------------------- config

const config = readJson('config.json');
const site = readJson('site.json');
const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+$/.test(baseUrl)) fail(`config.json baseUrl must look like https://cards.example.com (got "${config.baseUrl}")`);

if (!fs.existsSync(CARDS_FILE)) fail('cards.json not found. Copy cards.example.json to cards.json to get started.');
const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
if (!Array.isArray(cards)) fail('cards.json must be a list ([ ... ]) of cards.');

// ---------------------------------------------------------------- validate + assign tokens

let changed = false;
const seen = { token: new Set(), id: new Set(), slug: new Map() };

cards.forEach((card, i) => {
  const label = `Card #${i + 1}${card.title ? ` ("${card.title}")` : ''}`;
  if (!card.title || typeof card.title !== 'string') fail(`${label} needs a "title".`);
  if (card.type !== 'audio' && card.type !== 'video') fail(`${label}: "type" must be "audio" or "video".`);
  if (!card.source) fail(`${label} needs a "source" (e.g. "media/my-clip.mp3").`);

  if (!isUrl(card.source)) {
    const ext = path.extname(card.source).toLowerCase();
    if (!fs.existsSync(path.join(ROOT, card.source))) fail(`${label}: media file not found: ${card.source}`);
    if (!MEDIA_TYPES[ext]) fail(`${label}: unsupported media file type "${ext}".`);
    if (MEDIA_TYPES[ext] !== card.type) fail(`${label}: "${card.source}" looks like ${MEDIA_TYPES[ext]}, but type is "${card.type}".`);
  }
  if (card.poster && !isUrl(card.poster)) {
    if (!fs.existsSync(path.join(ROOT, card.poster))) fail(`${label}: poster image not found: ${card.poster}`);
    if (!POSTER_EXTS.has(path.extname(card.poster).toLowerCase())) fail(`${label}: poster must be a .jpg, .png, .webp or .avif image.`);
  }

  const slug = slugify(card.title);
  if (seen.slug.has(slug)) fail(`${label} has the same title as "${seen.slug.get(slug)}". Titles must be unique (they name the QR files).`);
  seen.slug.set(slug, card.title);

  // Tokens are permanent: an existing token is validated but never replaced.
  if (card.token === undefined || card.token === '') {
    card.token = randomId(TOKEN_BYTES);
    changed = true;
    console.log(`  + new token for "${card.title}"`);
  } else if (!TOKEN_PATTERN.test(card.token)) {
    fail(`${label}: existing token "${card.token}" is not valid (16+ characters of A-Z a-z 0-9 - _). Fix it by hand; the build never replaces a token.`);
  }
  if (seen.token.has(card.token)) fail(`${label}: token is used by another card.`);
  seen.token.add(card.token);

  if (!card.media_id) { card.media_id = randomId(MEDIA_ID_BYTES); changed = true; }
  if (card.poster && !card.poster_id) { card.poster_id = randomId(MEDIA_ID_BYTES); changed = true; }
  for (const id of [card.media_id, card.poster_id].filter(Boolean)) {
    if (seen.id.has(id)) fail(`${label}: media_id/poster_id is used twice.`);
    seen.id.add(id);
  }
});

if (changed) {
  fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2) + '\n');
  console.log('  ✓ saved new tokens to cards.json (back this file up!)');
}

// ---------------------------------------------------------------- output folder

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// Shared assets. Paths under /assets reveal nothing about any card.
const assets = path.join(DIST, 'assets');
copy(path.join(ROOT, 'src/card.css'), path.join(assets, 'card.css'));
copy(path.join(ROOT, 'src/player.js'), path.join(assets, 'player.js'));
copy(path.join(ROOT, 'src/icon.svg'), path.join(assets, 'icon.svg'));
const FONTS = [
  ['@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2', 'cormorant-500.woff2'],
  ['@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2', 'cormorant-400-italic.woff2'],
  ['@fontsource/inter/files/inter-latin-400-normal.woff2', 'inter-400.woff2'],
  ['@fontsource/inter/files/inter-latin-500-normal.woff2', 'inter-500.woff2'],
];
for (const [from, to] of FONTS) copy(path.join(ROOT, 'node_modules', from), path.join(assets, 'fonts', to));

// Optional logo: drop brand/logo.svg (or .png / .webp) in and rebuild.
const logoFile = ['svg', 'png', 'webp'].map((e) => `brand/logo.${e}`).find((f) => fs.existsSync(path.join(ROOT, f)));
let logoHtml = '<div class="logo-slot" aria-hidden="true"><span>Logo</span></div>';
if (logoFile) {
  const dest = `/assets/logo${path.extname(logoFile)}`;
  copy(path.join(ROOT, logoFile), path.join(DIST, dest));
  logoHtml = `<img class="logo" src="${dest}" alt="${esc(site.organization)} logo" width="72" height="72">`;
}

// ---------------------------------------------------------------- shared HTML pieces

const EXT = 'rel="noopener noreferrer" target="_blank"';

function socialUrl(network, value) {
  if (isUrl(value)) return value;
  const handle = value.replace(/^@/, '').trim();
  return network === 'instagram' ? `https://www.instagram.com/${handle}/` : `https://www.facebook.com/${handle}`;
}

function contactLinks() {
  const links = [];
  if (site.website) {
    const shown = plainText(site.website_display) || site.website.replace(/^https?:\/\//, '');
    links.push(`<a class="contact-link" href="${esc(site.website)}" ${EXT}>${icon('globe')}<span>${esc(shown)}</span></a>`);
  }
  if (site.email) links.push(`<a class="contact-link" href="mailto:${esc(site.email)}" rel="noopener noreferrer">${icon('mail')}<span>${esc(site.email)}</span></a>`);
  if (site.phone) {
    const tel = site.phone.replace(/(?!^\+)[^\d]/g, '');
    links.push(`<a class="contact-link" href="tel:${esc(tel)}" rel="noopener noreferrer">${icon('phone')}<span>${esc(site.phone)}</span></a>`);
  }
  const social = site.social || {};
  if (social.instagram) links.push(`<a class="contact-link" href="${esc(socialUrl('instagram', social.instagram))}" ${EXT}>${icon('instagram')}<span>Instagram</span></a>`);
  if (social.facebook) links.push(`<a class="contact-link" href="${esc(socialUrl('facebook', social.facebook))}" ${EXT}>${icon('facebook')}<span>Facebook</span></a>`);
  return links;
}

function icon(name) {
  const paths = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>',
    phone: '<path d="M6.6 3.5h2.6l1.4 4.3-2 1.4a12 12 0 0 0 6.2 6.2l1.4-2 4.3 1.4v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
    facebook: '<path d="M14 21v-7.5h2.6l.4-3H14V8.7c0-.9.3-1.5 1.5-1.5H17V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.7 1.4-3.7 3.9v2.1H8.5v3H11V21"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

function head(title, { preloadSerif = true } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0d0e10">
<title>${esc(title)}</title>
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
${preloadSerif ? '<link rel="preload" href="/assets/fonts/cormorant-500.woff2" as="font" type="font/woff2" crossorigin>\n' : ''}<link rel="stylesheet" href="/assets/card.css">
</head>`;
}

const atmosphere = '<div class="fog" aria-hidden="true"></div><div class="grain" aria-hidden="true"></div>';

function footer() {
  const links = contactLinks();
  return `<footer class="site-footer">
  <div class="brand">
    ${logoHtml}
    <p class="org">${esc(site.organization)}</p>
  </div>
  ${links.length ? `<section class="contact" aria-labelledby="contact-heading">
    <h2 id="contact-heading">Contact</h2>
    ${site.tagline ? `<p class="tagline">${esc(site.tagline)}</p>` : ''}
    <ul class="contact-links">
      ${links.map((l) => `<li>${l}</li>`).join('\n      ')}
    </ul>
  </section>` : ''}
</footer>`;
}

// ---------------------------------------------------------------- pages

const PLAY = '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg><svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
const SOUND = '<svg class="i-sound" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg><svg class="i-muted" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="wave" d="m15.5 9.5 5 5m0-5-5 5"/></svg>';
const FULLSCREEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="wave" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

// Decorative "signal" bars for audio cards; heights are seeded per card so they stay stable between builds.
function signalBars(seed, count = 48) {
  let x = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const w = 100 / count;
  let rects = '';
  for (let i = 0; i < count; i++) {
    const env = Math.sin((i / (count - 1)) * Math.PI) * 0.6 + 0.4;
    const h = Math.max(6, Math.round((0.25 + rand() * 0.75) * env * 100));
    rects += `<rect x="${(i * w + w * 0.2).toFixed(2)}" y="${((100 - h) / 2).toFixed(1)}" width="${(w * 0.6).toFixed(2)}" height="${h}" rx="0.6"/>`;
  }
  const svg = (cls) => `<svg class="${cls}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
  return `<div class="signal" aria-hidden="true">${svg('bars')}<div class="bars-played">${svg('bars')}</div></div>`;
}

function mediaUrl(card, idKey, srcKey) {
  const src = card[srcKey];
  if (isUrl(src)) return src;
  const ext = path.extname(src).toLowerCase();
  const rel = `/m/${card[idKey]}${ext}`;
  copy(path.join(ROOT, src), path.join(DIST, rel));
  return rel;
}

function cardPage(card) {
  const src = mediaUrl(card, 'media_id', 'source');
  const ext = path.extname(isUrl(card.source) ? new URL(card.source).pathname : card.source).toLowerCase();
  const mime = MIME[ext] ? ` type="${MIME[ext]}"` : '';
  const isVideo = card.type === 'video';

  const media = isVideo
    ? `<div class="screen">
        <video class="media" preload="metadata" playsinline controls${card.poster ? ` poster="${esc(mediaUrl(card, 'poster_id', 'poster'))}"` : ''}>
          <source src="${esc(src)}"${mime}>
          Your browser can't play this video.
        </video>
      </div>`
    : `<audio class="media" preload="metadata" controls>
        <source src="${esc(src)}"${mime}>
        Your browser can't play this audio.
      </audio>
      ${signalBars(card.media_id)}`;

  const transcript = card.transcript && String(card.transcript).trim()
    ? `<details class="transcript">
      <summary><span>Transcript</span></summary>
      <div class="transcript-body">${paragraphs(card.transcript)}</div>
    </details>` : '';

  return `${head(`${card.title} · ${site.organization}`)}
<body class="card-page ${isVideo ? 'is-video' : 'is-audio'}">
${atmosphere}
<main class="card">
  <header class="card-header">
    <p class="eyebrow">${isVideo ? 'Video' : 'Audio'} evidence</p>
    <h1>${esc(card.title)}</h1>
  </header>

  <section class="player" data-player aria-label="${isVideo ? 'Video' : 'Audio'} player">
    ${media}
    <div class="controls" hidden>
      <button type="button" class="btn play" data-play aria-label="Play">${PLAY}</button>
      <div class="timeline">
        <input type="range" class="seek" data-seek min="0" max="1000" step="1" value="0" aria-label="Seek" aria-valuetext="0:00">
        <div class="times"><span data-current>0:00</span><span data-duration>--:--</span></div>
      </div>
      <button type="button" class="btn mute" data-mute aria-label="Mute" aria-pressed="false">${SOUND}</button>
      ${isVideo ? `<button type="button" class="btn fs" data-fullscreen aria-label="Full screen">${FULLSCREEN}</button>` : ''}
    </div>
  </section>

  ${card.caption ? `<div class="caption">${paragraphs(card.caption)}</div>` : ''}
  ${transcript}
</main>
${footer()}
<script src="/assets/player.js" defer></script>
</body>
</html>
`;
}

function notFoundPage() {
  const bits = [];
  if (site.website) bits.push(`<a href="${esc(site.website)}" ${EXT}>${esc(plainText(site.website_display) || site.website.replace(/^https?:\/\//, ''))}</a>`);
  if (site.email) bits.push(`<a href="mailto:${esc(site.email)}" rel="noopener noreferrer">${esc(site.email)}</a>`);
  return `${head(`Nothing here · ${site.organization}`)}
<body class="lost">
${atmosphere}
<main class="lost-main">
  <p class="eyebrow">No signal</p>
  <h1>Nothing answered.</h1>
  <p class="lost-copy">Whatever you were looking for isn't here. Maybe it never was.</p>
</main>
<footer class="lost-footer">
  <p>${esc(site.organization)}</p>
  ${bits.length ? `<p class="lost-links">${bits.join('<span aria-hidden="true"> · </span>')}</p>` : ''}
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- write pages

for (const card of cards) {
  const file = path.join(DIST, 'c', card.token, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, cardPage(card));
}
fs.writeFileSync(path.join(DIST, '404.html'), notFoundPage());

// ---------------------------------------------------------------- headers (Netlify)

const extraMediaHosts = [...new Set(cards.flatMap((c) => [c.source, c.poster])
  .filter((s) => s && isUrl(s)).map((s) => new URL(s).origin))];
const csp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  `img-src 'self' data:${extraMediaHosts.map((h) => ` ${h}`).join('')}`,
  `media-src 'self'${extraMediaHosts.map((h) => ` ${h}`).join('')}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const HEADERS = [
  ['X-Robots-Tag', 'noindex, nofollow, noarchive'],
  ['Referrer-Policy', 'no-referrer'],
  ['Content-Security-Policy', csp],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'],
];

fs.writeFileSync(path.join(DIST, '_headers'), `# Generated by build.mjs; edit there, not here.
/*
${HEADERS.map(([k, v]) => `  ${k}: ${v}`).join('\n')}

/m/*
  Cache-Control: public, max-age=86400

/assets/*
  Cache-Control: public, max-age=604800
`);

// Headers live only in _headers: Netlify applies it for every deploy method
// (drag-and-drop, CLI, Git), and defining them in both files makes Netlify
// send each header twice.
fs.writeFileSync(path.join(DIST, 'netlify.toml'), `# Generated by build.mjs; edit there, not here.
# Deploy-ready folder: no build step, publish this directory as-is.
[build]
  publish = "."

# Custom 404: there is deliberately no index.html, so the site root and every
# unknown path get 404.html, which Netlify serves automatically with a 404 status.
#
# Response headers (X-Robots-Tag, Referrer-Policy, Content-Security-Policy, ...)
# are in the _headers file next to this one.
`);

// ---------------------------------------------------------------- QR codes + CSV

const qrDirName = config.baseUrlConfirmed ? 'qr' : 'qr-preview';
const qrDir = path.join(ROOT, qrDirName);
fs.rmSync(path.join(ROOT, 'qr-preview'), { recursive: true, force: true });
if (config.baseUrlConfirmed) fs.rmSync(qrDir, { recursive: true, force: true });
fs.mkdirSync(qrDir, { recursive: true });

const qrOpts = { errorCorrectionLevel: 'H', margin: QR_MARGIN, color: { dark: '#000000', light: '#ffffff' } };
const csvRows = [['title', 'type', 'url', 'qr_png', 'qr_svg']];
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

for (const card of cards) {
  const url = `${baseUrl}/c/${card.token}/`;
  const name = slugify(card.title);
  const png = `${qrDirName}/${name}.png`;
  const svg = `${qrDirName}/${name}.svg`;
  await QRCode.toFile(path.join(ROOT, png), url, { ...qrOpts, type: 'png', width: QR_PNG_WIDTH });
  fs.writeFileSync(path.join(ROOT, svg), await QRCode.toString(url, { ...qrOpts, type: 'svg' }));
  csvRows.push([card.title, card.type, url, png, svg]);
}
fs.writeFileSync(path.join(ROOT, 'cards-urls.csv'), csvRows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n');

// ---------------------------------------------------------------- report

const MB = 1024 * 1024;
const big = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (fs.statSync(p).size > 10 * MB) big.push(`${path.relative(DIST, p)} (${(fs.statSync(p).size / MB).toFixed(1)} MB)`);
  }
})(DIST);

console.log(`\n✓ Built ${cards.length} card page(s) into dist/`);
console.log(`✓ QR codes in ${qrDirName}/ and URL list in cards-urls.csv`);
if (big.length) {
  console.warn(`\n⚠ These files are over Netlify's recommended 10 MB per file. Compress them or host them elsewhere (see README):\n  - ${big.join('\n  - ')}`);
}
if (!config.baseUrlConfirmed) {
  console.warn(`\n⚠ PREVIEW QR CODES. They point at ${baseUrl}, which has not been confirmed yet.`);
  console.warn('  Do not print them. Once the domain is live, set "baseUrlConfirmed": true in config.json and rebuild.');
}
