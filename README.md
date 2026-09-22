# Pharos Paranormal Society

The website for Pharos Paranormal Society, built with [Astro](https://astro.build), [Tailwind CSS](https://tailwindcss.com), and [Decap CMS](https://decapcms.org) for content editing.

## How to edit this site

You don't need to write any code or use GitHub to update this site. Everything — team bios, testimonials, blog posts, and contact info — can be edited from a simple web form.

1. Go to **yoursite.com/admin** and log in with your email and password.
2. Click the collection you want to edit: **Team**, **Testimonials**, **Blog**, or **Site Settings**.
3. Click an existing entry to edit it, or click **New [item]** to add a new one. Fill in the fields — each one has a short hint explaining what to put there.
4. When you're happy with your changes, click **Publish** (or **Save** for Site Settings).
5. That's it. Your changes go live automatically, usually within a minute or two.

A few tips:

- To add a new team member, go to **Team → New Team Member**, fill in their name, role, photo, and bio, and publish. They'll show up on the About page automatically — no other steps needed.
- To feature a testimonial on the homepage, open it and switch the **Featured on Homepage?** toggle on.
- To change the contact email, phone number, or social media links, go to **Site Settings** — this updates the footer, contact page, and follow section everywhere at once.
- If you ever get logged out, just go back to `/admin` and log in again.

---

## For developers

### Local development

```bash
npm install
npm run dev
```

The site runs at `http://localhost:4321`. The Decap CMS admin UI is served at `/admin`, but it needs Netlify Identity + Git Gateway (see below) to actually log in and save content — locally you'll mostly be editing the Markdown/JSON files in `src/content/` directly.

### Project structure

- `src/content/` — all editable content (team, testimonials, blog, site settings), defined by the schema in `src/content/config.ts`
- `src/components/` — reusable UI pieces (header, footer, cards, contact form, social feed)
- `src/layouts/Layout.astro` — shared page shell (fonts, header, footer)
- `src/pages/` — one file per route (`/`, `/about`, `/testimonials`, `/blog`, `/blog/[slug]`, `/contact`)
- `public/admin/` — Decap CMS config (`config.yml`) and entry point (`index.html`)
- `public/images/logo.png` — placeholder logo; drop the final logo file in at this exact path to replace it everywhere (header, footer, favicon)

### Brand tokens

Colors and fonts are defined in `tailwind.config.mjs`:

- `ink` (`#0A0A0A`), `paper` (`#FFFFFF`), `cream` (`#F0EAD6`) — the only colors used site-wide, plus greyscale tints of `ink` for secondary text
- `font-heading` (Libre Franklin / Archivo Black) for headings, `font-body` (Inter) for body text, both loaded from Google Fonts in `Layout.astro`

### Deploying to Netlify

1. Push this project to a GitHub repository.
2. In Netlify, click **Add new site → Import an existing project**, and connect the GitHub repo.
3. Build settings are already set via `netlify.toml` (`npm run build`, publishes `dist`) — you shouldn't need to change anything.
4. Deploy the site once so it has a live URL.
5. Turn on the CMS login:
   - In the Netlify dashboard, go to **Site configuration → Identity** and click **Enable Identity**.
   - Under **Identity → Registration**, set it to **Invite only** (recommended, so random people can't sign up).
   - Under **Identity → Services**, enable **Git Gateway**. This is what lets the CMS commit content changes to GitHub on your behalf, without editors ever touching Git.
   - Go to **Identity** and click **Invite users** to send yourself (and any other editors) a login invite by email.
6. Visit `yoursite.com/admin`, accept the invite, set a password, and log in. You're editing live content from here on.

### Content model

Defined in `src/content/config.ts`:

- **team** — `name`, `role`, `photo`, `bio` (markdown body), `specialties` (list), `order`
- **testimonials** — `name`, `location`, `quote`, `rating` (1–5), `date`, `featured`
- **blog** — `title`, `date`, `author`, `coverImage`, `excerpt`, `body` (markdown), `tags`
- **site-settings** — singleton: `email`, `phone`, `address`, `investigationRequestNote`, `socialLinks` (instagram/facebook/tiktok/youtube)

The Decap CMS config (`public/admin/config.yml`) mirrors this schema field-for-field.

### Social media feed

`src/components/SocialFeed.astro` reads `site-settings.socialLinks` and renders a clean icon grid linking out to whichever platforms are filled in. True embedded feeds (Instagram/TikTok/Facebook widgets) require per-platform developer API keys, which this project deliberately avoids to keep it free and dependency-free — see the comment at the top of that component for where to wire embeds in later.

### Investigation calendar

The `/calendar` page lists upcoming Midnight Investigations from the [Ghostly Images of Gettysburg schedule](https://www.gettysburgbattlefieldtours.com/events/category/ghost-tours/midnight-investigation/). A GitHub Action (`.github/workflows/sync-midnight-investigations.yml`) runs every morning, fetches the dates with `scripts/sync-midnight-investigations.mjs`, and commits any changes to `src/data/midnight-investigations.json`. That commit triggers a Netlify rebuild. To refresh the dates right away, open the repo's **Actions** tab and run **Sync midnight investigation dates** manually. Dates that have already passed are hidden automatically.

Sold-out dates are detected automatically: the sync checks Ghostly Images' ticket system, and when a date has no seats left it gets a red **Sold Out** ribbon across it and its **Book** button becomes **Details** (still linking to the event page). If a date opens back up, the ribbon comes off on the next sync. To force a date to show as sold out anyway, add its start date (`YYYY-MM-DD`) to `dates` in `src/data/sold-out.json`; the sync never changes that file.

### Contact

The `/contact` page points visitors straight at a `mailto:` link built from `site-settings.email`, rather than an on-site form — simplest possible setup, no Netlify Forms configuration needed.

### Sample content

The site ships with placeholder content — 3 team members, 3 testimonials, and 2 blog posts — so the design is fully previewable before real content is added. Replace or remove these through the CMS (or by editing/deleting files in `src/content/`) once real bios, photos, and posts are ready.
