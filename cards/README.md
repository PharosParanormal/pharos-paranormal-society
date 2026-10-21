# Pharos Paranormal Society: trading card pages

A tiny static site for the trading cards. Each card's QR code opens one hidden page at
`https://cards.pharosparanormal.com/c/<token>/` that plays one audio or video clip.
There's no home page, no list of cards, and no links between cards. Every other address
shows a "Nothing answered." 404 page.

## ⚠ Keep the card list private

This GitHub repository is **public**. The tokens in `cards.json` are what keep each page
hidden, so `cards.json`, `media/`, `dist/`, the QR folders and `cards-urls.csv` are
**git-ignored and live only on your computer**. Committing them would publish every card's
URL.

- **Back up `cards.json`** somewhere private (e.g. Google Drive). If you lose it, the next build
  makes new tokens and every printed QR code stops working.
- Never edit or delete a card's `token` once its QR code has been printed.

## Adding a card

1. Drop the clip into `media/` (e.g. `media/attic-whisper.mp3`).
2. Add an entry to `cards.json`. Don't add a `token`: the build creates it.
   ```json
   {
     "title": "The Attic Whisper",
     "type": "audio",
     "source": "media/attic-whisper.mp3",
     "caption": "Recorded at 2:14 a.m. on the third floor.",
     "transcript": "Optional. Leave empty (or remove) to hide the Transcript toggle."
   }
   ```
   Video cards use `"type": "video"` and can add `"poster": "media/attic-poster.jpg"`.
3. Run `npm run build`.
4. Run `npm test` to check it.
5. Deploy the `dist/` folder (see below), then send `qr/<title>.png` or `.svg` to the printer.

The build adds `token`, `media_id` (and `poster_id`) to the card in `cards.json`. Change
the title, caption, transcript or media any time and rebuild: the URL stays the same. Card
titles must be unique because they name the QR files.

First time on a new computer: install [Node.js](https://nodejs.org) 18 or newer, then run
`npm install` in this folder once.

## Files

| File | What it is |
| --- | --- |
| `cards.json` | Your cards: the source of truth (private, back it up) |
| `cards.example.json` | Sample entries (no tokens), safe to commit |
| `site.json` | Organization name, website, email, phone, socials, tagline for every page's Contact section. Blank fields are left off the page. |
| `config.json` | `baseUrl` (the one place the domain lives) and `baseUrlConfirmed` |
| `brand/logo.svg` (or `.png`, `.webp`) | Optional. Drop a logo in and rebuild to fill the footer logo slot. Use a version that reads on a dark background (light artwork, transparent background). |
| `build.mjs` | The build script |
| `test.mjs` | Checks that every page and media file loads, nothing links to another card, the 404s work, and each QR code decodes to its card URL |
| `src/` | Page styles, player script, favicon |
| `dist/` | **The deploy-ready site** (generated) |
| `qr/` | Final print QR codes: 1200×1200 PNG and SVG, high (H) error correction (generated) |
| `qr-preview/` | QR codes made before the domain is confirmed. **Don't print these.** |
| `cards-urls.csv` | Title → URL → QR file, for your records (generated) |

## Preview vs. final QR codes

While `config.json` has `"baseUrlConfirmed": false`, QR codes go into `qr-preview/` and the
build prints a warning. Once `cards.pharosparanormal.com` is live and a test card opens on
your phone, set it to `true` and rebuild: final codes go to `qr/`.

Changing `baseUrl` after printing would break every printed card. Pick the domain once.

## Deploying to Netlify

Make this a **separate Netlify site** from the main website:

1. In Netlify: **Add new site → Deploy manually**, and drag the `dist/` folder onto the page.
2. To update after adding cards: open the site's **Deploys** tab and drag `dist/` in again.
   (Or from this folder: `npx netlify-cli deploy --prod --dir dist`.)

Don't connect this site to the GitHub repo: Netlify can't build it from GitHub because
`cards.json` and the media aren't there (on purpose).

`dist/` already contains:

- `_headers`: `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, a strict
  Content-Security-Policy (no third-party anything), and cache rules. Netlify applies it for
  every deploy method, including drag-and-drop.
- `netlify.toml`: publish settings. The headers are kept only in `_headers` because Netlify
  sends a header twice if both files define it.
- `404.html`: Netlify serves it automatically for the root and every unknown path.

There's deliberately no `robots.txt`, since a Disallow list would reveal the `/c/` structure.
Every page carries a `noindex` meta tag and header instead.

## Pointing cards.pharosparanormal.com at Netlify

1. In the cards site on Netlify: **Domain management → Add a domain** → `cards.pharosparanormal.com`.
2. At wherever `pharosparanormal.com`'s DNS is managed (your registrar, Cloudflare, etc.), add:

   | Type | Name / Host | Value / Target |
   | --- | --- | --- |
   | CNAME | `cards` | `<your-cards-site>.netlify.app` |

   Use the exact `.netlify.app` name Netlify shows for the cards site. If the domain already uses
   Netlify DNS, Netlify adds this record for you.
   If you use Cloudflare, set the record to **DNS only** (grey cloud) so Netlify can issue the certificate.
3. Wait for DNS to update (minutes to a few hours). Netlify then issues the HTTPS certificate
   automatically (**Domain management → HTTPS**).
4. Open a card URL from `cards-urls.csv` on your phone. When it works, confirm the base URL (above)
   and make the final QR codes.

## File sizes and hosting limits

- Netlify recommends keeping **each file under 10 MB**. The build warns about anything bigger.
- Drag-and-drop deploys work best with the whole folder **under about 50 MB**.
- On Netlify's credit-based plans, bandwidth draws from your team's monthly credits. On the Free plan,
  running out **pauses every site on the team, including the main website**, until the month resets.
  Short audio clips are fine. Video is what eats bandwidth. Check usage under **Team → Usage & billing**.

If clips are large or you expect a lot of video plays, compress them first (below), or host the
media on **Cloudflare R2** (no bandwidth fees). Upload the file under a random name
(e.g. `k3J9xQ2mVb7LpR4w.mp4`) to a bucket with a public custom domain, then set the card's
`"source"` to the full `https://...` URL. The build links to it directly and adds that
domain to the security policy. Don't turn on bucket listing.

### Compressing for phones (optional, needs [ffmpeg](https://ffmpeg.org))

`-map_metadata -1` also strips hidden metadata such as recording location and device.

```bash
# Audio → MP3, 128 kbps (use -b:a 96k -ac 1 for spoken EVP clips to halve the size)
ffmpeg -i input.wav -map_metadata -1 -c:a libmp3lame -b:a 128k media/output.mp3

# Video → 720p H.264 MP4 that starts playing before it fully downloads
ffmpeg -i input.mov -map_metadata -1 -vf "scale=-2:'min(720,ih)'" \
  -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 96k media/output.mp4

# Poster image from the 2-second mark
ffmpeg -ss 2 -i media/output.mp4 -frames:v 1 -q:v 3 media/output-poster.jpg
```

## How the hiding works

- Tokens are 22 characters (128 random bits from Node's `crypto.randomBytes`), URL-safe, created once
  and never regenerated.
- Media is copied to `/m/<random>.<ext>`. The original file names never reach the site.
- No index page, sitemap, robots.txt, analytics, third-party fonts or scripts. Fonts are self-hosted.
- The only links on a card page are your website, email, phone and social links, each with
  `rel="noopener noreferrer"`. A `no-referrer` policy keeps the card URL from being sent to those sites.
- Netlify doesn't list directories, so `/c/` and `/m/` show the 404 page.

One limit: anyone who has a card's URL can share it. That's the nature of an unlisted link. The URL
can't be guessed, and nothing on the site points from one card to another.
