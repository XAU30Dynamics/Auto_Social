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
| GET    | `/api/posts`        | Read rows `A2:T` from the `Posts` sheet, return newest-first as JSON         |
| PATCH  | `/api/posts/:row`   | Per-field cell update via `batchUpdate` — body is `{ fieldName: value, ... }` where `fieldName` must be a key in the `COL` map |
| POST   | `/api/threads/generate` | Body `{ topic, pillar }`. Proxies to the Make Thread Generator webhook (`MAKE_THREAD_WEBHOOK_URL`), which runs Claude with the brand brief and returns a Threads chain. Server parses/normalizes the JSON to `{ pillar, topic_tag, hook, posts[], cta, total_posts }`. 400 if `topic` empty; 500 if env var unset; 502 on upstream/parse failure. |
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

`SHEET_NAME` defaults to `Posts` if unset.

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
- **README claims Canva Autofill API integration** — there is no Canva API call in the server. The UI just deep-links to two static Canva brand-template URLs (`public/index.html:401-402`) and the operator copy/pastes fields into Canva manually. Don't promise Canva-API behavior without implementing it.
- **The `hashtags` column is merged into `caption` on read.** `GET /api/posts` returns `caption = caption + "\n\n" + hashtags`, and the UI no longer renders a separate hashtags input. If you re-introduce a hashtags field, also unmerge in `server.js:63-68`. PATCH still accepts `hashtags` as a field name and writes to column H.
- **Column map is positional.** Inserting a column mid-sheet (or in the `COL` map without matching the sheet) will silently corrupt every row. Append new columns at the end of both.
- **Catch-all route serves `index.html` for any unmatched GET**, including paths that look like missing API routes. A typo'd API path won't 404 — it'll return the dashboard HTML. Check the response `Content-Type` when debugging.
- **`GOOGLE_PRIVATE_KEY` newline handling**: the value is stored with literal `\n` escapes and unescaped via `.replace(/\\n/g, '\n')` (`server.js:18`). When pasting into Railway, keep the `\n` escapes — don't paste real newlines.
- **No request auth.** Anyone who can reach the deployed URL can read and write the sheet via `/api/posts` and `/api/posts/:row`. Keep the Railway URL private, or add auth before exposing it.
