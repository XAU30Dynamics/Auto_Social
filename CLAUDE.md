# Auto Social — CLAUDE.md

Mobile-first approval dashboard for the XAU30 Dynamics social media automation pipeline. The dashboard itself is a thin read/write UI over a Google Sheet — the heavy automation (post generation, Telegram notifications, scheduling) lives in **Make.com** scenarios that read/write the same sheet out-of-band.

## Stack

- **Runtime**: Node.js ≥ 18
- **Backend**: Express 4 (`server.js`, single file, ~250 lines)
- **Frontend**: Single static HTML file (`public/index.html`) — vanilla JS, no build step, no framework, no bundler. Styled to install as an iOS home-screen PWA.
- **Data store**: Google Sheets (via `googleapis` service-account auth) — the `Posts` tab is the source of truth.
- **External APIs called from the server**:
  - Google Sheets API (`spreadsheets.values.get` / `batchUpdate`)
- **External APIs called from the browser only**: Canva (static brand-template URLs, opened in a new tab — no Canva API call from this codebase despite what the README implies).
- **Deploy target**: Railway (auto-deploys on push to `main`).

## Repo layout

```
.
├── server.js          # Express app + all API routes
├── package.json
├── public/
│   └── index.html     # Entire dashboard UI (HTML + CSS + JS in one file)
├── env.example        # Template for .env (note: no leading dot — see gotchas)
├── gitignore          # Note: no leading dot — see gotchas
└── README.md
```

There are no tests, no lint config, no TypeScript, and no build pipeline. Edits to `public/index.html` are picked up on next page load; edits to `server.js` need a restart (or `npm run dev` for nodemon).

**Puppeteer / graphics rendering**: `POST /api/graphic/render` uses `puppeteer` (bundled Chromium) to screenshot Claude-designed HTML into 1080×1350 PNGs. `nixpacks.toml` installs Chromium's shared-library `aptPkgs` on Railway and pins `PUPPETEER_CACHE_DIR=/app/.cache/puppeteer` so the Chrome downloaded at `npm install` is found at runtime. The renderer waits on `domcontentloaded` + `document.fonts.ready`/images (hard-capped) — never `networkidle0`, which a stalled font request can hang. Screenshots come back as `Uint8Array` in Puppeteer v24 — wrap in `Buffer.from()` before `res.send()` or Express JSON-serializes them.

## Build / run commands

```bash
npm install
npm run dev      # nodemon server.js — auto-restart on changes
npm start        # node server.js — production
```

Default port is `3000` (override with `PORT`). Static files are served from `/public`; an Express catch-all (`app.get('*')`) returns `index.html` so SPA-style routing works.

## HTTP API

All routes live in `server.js`:

| Method | Route               | Purpose                                                                      |
|--------|---------------------|------------------------------------------------------------------------------|
| POST   | `/api/login`        | Body `{ password }`. Checks against `DASHBOARD_PASSWORD`; on success sets a 1-year HttpOnly `sd_auth` cookie. All other `/api/*` routes (except `GET /api/graphic/:row.png`, which Buffer fetches cookie-less) return 401 without that cookie. If `DASHBOARD_PASSWORD` is unset, auth is disabled entirely. |
| GET    | `/api/posts`        | Read rows `A2:T` from the `Posts` sheet, return newest-first as JSON         |
| PATCH  | `/api/posts/:row`   | Per-field cell update via `batchUpdate` — body is `{ fieldName: value, ... }` where `fieldName` must be a key in the `COL` map |
| POST   | `/api/threads/generate` | Body `{ topic, pillar }`. Proxies to the Make Thread Generator webhook (`MAKE_THREAD_WEBHOOK_URL`), which runs Claude with the brand brief and returns a Threads chain. Server parses/normalizes the JSON to `{ pillar, topic_tag, hook, posts[], cta, total_posts }`. 400 if `topic` empty; 500 if env var unset; 502 on upstream/parse failure. |
| POST   | `/api/graphic/render` | Body `{ html }` — a full self-contained HTML document designed at 1080×1350. Renders it in headless Chromium (Puppeteer) and returns a pixel-exact **1080×1350 PNG** (`image/png`). 400 if `html` empty; 502 on render failure. Puppeteer is `require()`d lazily so a Chromium hiccup can't take down the rest of the app. Reuses one browser across requests. |
| GET    | `/api/graphic/:row.png` | Renders the **saved** `graphic_html` for a post row to a 1080×1350 PNG at a stable URL (reads column U from the sheet). Exists so Buffer can fetch the graphic by link. 404 if the row has no graphic. |
| GET    | `/api/threadlog`    | Recent auto-posted threads (`ThreadLog` tab, last ~2 days newest-first) for the dashboard's Auto Threads panel. Errors degrade to `[]`. |
| GET    | `/api/insights`     | Live 30-day engagement rollup from Buffer's GraphQL API (per-channel totals, aggregate metrics, top/weakest posts by views) for the dashboard's Insights panel. Needs `BUFFER_TOKEN`; org id is hardcoded (`BUFFER_ORG_ID`). Read-only. |
| POST   | `/api/buffer/send/:row` | Sends a reviewed post to Buffer. Body `{ channels?: ['instagram','x','threads'], mode?: 'now'|'queue' }`. Routes **Instagram by brand** (`ig_sd` vs `ig_md` channel); X + Threads each have one channel for any brand. Attaches the graphic as an image URL Buffer fetches (`/api/graphic/:row.png`). Needs `BUFFER_TOKEN`. Returns per-channel `{ok,id}`/`{ok:false,error}`. Buffer channel IDs are hardcoded in `server.js` (`BUFFER_CHANNELS`). |
| GET    | `*`                 | Serves `public/index.html`                                                   |

PATCH safety: unknown field names are silently skipped (see `if (COL[field] === undefined) continue;` in `server.js:111`). Sending only unknown fields returns `{ ok: true }` with no writes.

## Google Sheet contract (`Posts` tab)

The column index map lives in `server.js:29-50` (`COL`). It must stay aligned with the sheet — adding a column anywhere except the end will shift everything and corrupt reads/writes.

| Col | Field            | Notes                                                                 |
|-----|------------------|-----------------------------------------------------------------------|
| A   | timestamp        |                                                                       |
| B   | date             |                                                                       |
| C   | day              |                                                                       |
| D   | pillar           | Content pillar, mapped to short tags in `pillarShort()`               |
| E   | image_url        | Chart screenshot — can expire; UI falls back to "Image expired"       |
| F   | headline         |                                                                       |
| G   | caption          | Server merges G + H into one block on read (see gotcha below)         |
| H   | hashtags         | **Read-only fusion** with caption on GET; PATCH `hashtags` still works|
| I   | x_post           |                                                                       |
| J   | threads_post     |                                                                       |
| K   | status           | `Pending Review` / `Approved` / `Rejected`                            |
| L   | subheading       |                                                                       |
| M   | cta_text         |                                                                       |
| N   | bg_variant       | `'1'` = black template, `'2'` = white template                        |
| O   | canva_url        | (README calls this `canva_design_url`)                                |
| P   | final_image      | (README calls this `final_image_url`)                                 |
| Q   | posted_ig        | ISO timestamp string when marked posted, empty when unmarked          |
| R   | posted_x         | Same                                                                  |
| S   | posted_threads   | Same                                                                  |
| T   | graphic_text     |                                                                       |
| U   | graphic_html     | Full self-contained 1080×1350 HTML artwork (Claude-designed). Rendered to PNG by `POST /api/graphic/render`; dashboard shows a live scaled preview + Download PNG. Empty on posts predating this field. |
| V   | brand            | `StrategyDynamics` or `MarketDynamics` (chosen by the generator). Drives Buffer **Instagram** routing (SD→SD IG profile, MD→MD IG profile). Empty on older posts → treated as StrategyDynamics; editable via the dashboard brand badge. |

`SHEET_NAME` defaults to `Posts` if unset.

## Insights collector (engagement history)

`server.js` runs a background job (1 min after boot, then every 6 h) that snapshots each sent Buffer post's engagement metrics into the **`Insights` tab** of the Posts spreadsheet — **once per post, after the post is 7 days old** (metrics matured; append-only, no updates). State lives entirely in the sheet: the window is (newest logged `sent_at`, now−7d], so missed runs self-heal and restarts can't duplicate rows. Tab + header row are auto-created if missing. Any error is logged and skipped — the collector can never affect posting or the rest of the app. Columns: `pulled_at, sent_at, channel, post_id, text (first 180 chars), views (views|impressions), reach, reactions, comments, shares (shares+reposts+quotes), saves, follows, eng_rate, clicks`.

The purpose is a permanent engagement history for periodically distilling "what's working" guidance into the brand brief (human-in-the-loop — the brief is never auto-edited). Note: `eng_rate` units are inconsistent across services in Buffer's API (Instagram returns a fraction, X/Threads a percentage) — compare within a channel, not across.

## Brand brief — source of truth

The AI brand brief that drives ALL generated content lives in **cell `A1` of the `Brief` tab** of the Posts spreadsheet. Every Make scenario (content generation, thread generator, threads auto-poster) reads that cell fresh on each run — the cell is what the AI obeys.

**`BRIEF.md` in this repo is an exact, git-versioned mirror of that cell** (verified byte-identical 7 Jul 2026). Workflow for changing the brief: edit `BRIEF.md`, commit, then push the ENTIRE file content into `Brief!A1` (full overwrite — via a temp Make scenario `updateCell` with `valueInputOption:"RAW"`, since this repo has no Google creds locally). Never edit the cell without updating `BRIEF.md` (and vice versa) or they drift. `StrategyDynamics- Marketing_Brief.docx` is the original seed document and is STALE — do not treat it as current.

## Make.com + Telegram integration

This repo does **not** contain any Make.com or Telegram code — those integrations live in Make scenarios outside this repo and interact with the system exclusively through the same Google Sheet. Typical flow:

1. A Make scenario generates post drafts and appends rows to the `Posts` sheet (status `Pending Review`).
2. The Make scenario fires a Telegram message linking to this dashboard.
3. Operator reviews/edits/approves in the dashboard → PATCH writes back to the sheet.
4. A second Make scenario watches for `status = Approved` and handles publishing.

**Implication**: if the API contract you care about is "what Make expects to read/write," the answer is the column map in `server.js:29-50`. Changing column order or renaming columns will break Make scenarios silently. Coordinate changes with the Make side.

## Environment variables

Defined in `env.example`. All are required for full functionality:

| Var                             | Required by                              |
|---------------------------------|------------------------------------------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`  | All `/api/posts*` routes                 |
| `GOOGLE_PRIVATE_KEY`            | Same — `\n` literals are unescaped at runtime |
| `SPREADSHEET_ID`                | Same                                     |
| `SHEET_NAME`                    | Optional, defaults to `Posts`            |
| `CANVA_CLIENT_ID`               | Listed in env.example but **unused** server-side |
| `CANVA_CLIENT_SECRET`           | Same — unused                            |
| `CANVA_ACCESS_TOKEN`            | Same — unused                            |
| `CANVA_TEMPLATE_BLACK`          | Unused server-side; templates are hardcoded in `public/index.html:401-402` |
| `CANVA_TEMPLATE_WHITE`          | Same                                     |
| `MAKE_THREAD_WEBHOOK_URL`        | `POST /api/threads/generate` (Thread Generator). Custom-webhook URL of the `XAU30 Social — 2. Thread Generator` Make scenario. Unset ⇒ that route 500s; rest of app unaffected. |
| `BUFFER_TOKEN`                  | `POST /api/buffer/send/:row`. Buffer public API token (Bearer) for posting to IG/X/Threads via Buffer's GraphQL API (`https://api.buffer.com`). Unset ⇒ that route 500s. |
| `PUBLIC_BASE_URL`              | Optional. Base URL Buffer uses to fetch the graphic image; defaults to the request's own `protocol://host` (correct on Railway). |
| `DASHBOARD_PASSWORD`           | Single shared password for the dashboard (see `POST /api/login`). Unset ⇒ auth disabled (local dev convenience). |
| `PORT`                          | Optional, defaults to `3000`             |

The service account must have edit access to the spreadsheet — share the sheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL` explicitly.

## Conventions

- **No frameworks, no build step.** When in doubt, write more vanilla JS rather than introducing tooling.
- **One file per layer**: all server logic in `server.js`, all UI in `public/index.html` (HTML + CSS + JS inline). Don't split unless asked.
- **Section dividers** in `server.js` use box-drawing comments (`// ─── Section ───`). Match the style if adding routes.
- **DOM IDs** in the frontend follow `f-<field>-<rowIndex>` for inputs (e.g. `f-headline-42`) and `cc-<field>-<rowIndex>` for character counters. `renderCard()` is the source of truth.
- **PATCH-on-edit** for individual toggles (variant select, posted toggles); explicit Save button for text fields. Don't auto-save text inputs on blur — that's intentional.
- **Newest first**: `GET /api/posts` does `.reverse()` before returning so the latest sheet row shows up top.

## Gotchas

- **`gitignore` is missing its leading dot** (`gitignore`, not `.gitignore`). Git is not ignoring `node_modules/`, `.env`, etc. Rename when convenient, but coordinate with whoever owns the working tree first.
- **`env.example` is also missing its leading dot.** The README references `.env.example`. Both work as docs, but tools that expect the dotfile name won't find it.
- **Canva is being retired.** The manual Canva-template flow (deep-link + copy/paste fields) has been replaced by the auto-graphic engine: Claude designs a bespoke 1080×1350 HTML artwork per post (sheet column U `graphic_html`), the dashboard previews it live and renders a downloadable PNG via `POST /api/graphic/render`. The old Canva variant selector / "Open in Canva" button was removed from the card; `CANVA_*` constants and `selectVariant()` remain defined in `index.html` but are now dead. The README's "Canva Autofill API" claim was always false — there was never a Canva API call.
- **The `hashtags` column is merged into `caption` on read.** `GET /api/posts` returns `caption = caption + "\n\n" + hashtags`, and the UI no longer renders a separate hashtags input. If you re-introduce a hashtags field, also unmerge in `server.js:63-68`. PATCH still accepts `hashtags` as a field name and writes to column H.
- **Column map is positional.** Inserting a column mid-sheet (or in the `COL` map without matching the sheet) will silently corrupt every row. Append new columns at the end of both.
- **Catch-all route serves `index.html` for any unmatched GET**, including paths that look like missing API routes. A typo'd API path won't 404 — it'll return the dashboard HTML. Check the response `Content-Type` when debugging.
- **`GOOGLE_PRIVATE_KEY` newline handling**: the value is stored with literal `\n` escapes and unescaped via `.replace(/\\n/g, '\n')` (`server.js:18`). When pasting into Railway, keep the `\n` escapes — don't paste real newlines.
- **Auth is a single shared password** (`DASHBOARD_PASSWORD` + 1-year HttpOnly cookie, added 9 Jul 2026). The frontend wraps `window.fetch` — any `/api/*` 401 pops the login overlay. `GET /api/graphic/:row.png` is deliberately unauthenticated (Buffer fetches it with no cookies), so saved graphics are viewable by anyone who guesses a row number — acceptable, they're published posts anyway. If `DASHBOARD_PASSWORD` is unset (e.g. local dev with no `.env`), everything is open, matching pre-auth behaviour.
