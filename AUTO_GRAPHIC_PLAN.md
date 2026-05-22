# Auto-Graphic Generation — Plan

**Status:** Concept / not started
**Last discussed:** 2026-05-22
**Goal:** Eliminate the manual Canva step. After Make generates a post and writes it to the sheet, automatically render the branded graphic on the Railway server so the dashboard shows a finished image ready to download and post.

Target outcome: per-post time drops from ~5–10 min today to ~30–60 sec (just review + tap copy + post).

---

## Why this is the next move

Current flow:
1. Telegram → Make → Claude generates copy → Google Sheet ✅
2. Dashboard reads sheet, lets you edit/approve ✅
3. **You open Canva, paste 4 fields, swap chart image, export ❌** ← this is the bottleneck (3–5 min/post)
4. Copy text per platform, post manually

Step 3 is the single biggest remaining time sink. It's also the step where human-in-the-loop variance creeps in (wrong field, missed image swap, layout nudges).

Canva Autofill API was the obvious fix but requires Enterprise tier. The alternative is to render the graphic ourselves on the existing Railway server using the same template design exported as a static background.

---

## Proposed architecture

**One-line summary:** Export the Canva templates as transparent-text PNG backgrounds. Composite the dynamic text + chart image on the server using `sharp`. No browser, no third-party SaaS.

### Pipeline

```
Make scenario  →  Google Sheet row  →  Dashboard "Generate" button
                                                  ↓
                                  POST /api/generate-graphic { row }
                                                  ↓
                          Load template-black.png or template-white.png
                                                  ↓
                  Render SVG text layers (heading, subheading, body, CTA)
                                                  ↓
                          Resize + position chart image
                                                  ↓
                                   sharp.composite()
                                                  ↓
                              Output PNG → Cloudinary
                                                  ↓
                            Write URL to sheet column P (final_image)
                                                  ↓
                              Dashboard shows preview + download
```

### Why this shape, not the alternatives

| Option | Verdict |
|---|---|
| **Canva Autofill API** | Blocked — Enterprise tier only |
| **Bannerbear / Placid / HTMLCSStoImage** | Works, but $29–49/mo subscription, less control |
| **HTML + Puppeteer** | Works, but adds ~300MB of headless Chrome to Railway, font race conditions, more failure modes |
| **SVG + sharp** ← chosen | $0 incremental, fully deterministic, <500ms render, simplest failure surface |

The chosen approach is the simplest because the templates are **static designs with fixed-position text and image slots** — no flowing layouts, no conditional logic, no dynamic charts. That's exactly the case `sharp` + pre-rendered PNG handles best.

---

## What the templates actually contain

Both variants (black + white) share the same skeleton. Static elements (baked into the background PNG, never change):

- Gold gradient bars top + bottom
- XAU30 Dynamics logo (top-left)
- Footer text `xau30dynamics.com`
- Background color / radial glow

Dynamic elements (rendered on top each time):

| Field | Source (sheet column) | Font | Notes |
|---|---|---|---|
| Heading | F (headline) | Playfair Display, ALL CAPS | Auto-shrink if too long |
| Subheading | L (subheading) | DM Sans / Avenir, gold | Single line typical |
| Body text | T (graphic_text) | DM Sans, body | 3–5 sentences, paragraph wrap |
| CTA | M (cta_text) | DM Sans, larger | 3–7 words |
| Chart image | E (image_url) | — | Resize + position into fixed slot |

Brand colors:
- Navy: `#103050`
- Gold: `#D0A030`
- Light gold: `#D4B842`
- White/cream: `#F0F0F0`
- Black: `#000000`

---

## Implementation plan

Total estimate: **~1.5 focused days**.

| Step | Effort |
|---|---|
| Export both templates from Canva as transparent-text PNGs | 30 min |
| Measure exact coordinates + font sizes for each dynamic field (heading X/Y, subheading X/Y, etc.) | 30 min |
| Add `sharp` to dependencies; write the renderer (~80–120 lines, one function) | 3–4 hours |
| Heading shrink-to-fit logic | ~1 hour |
| Body text overflow + auto-shrink | ~1 hour |
| Chart aspect-ratio normalization (letterbox or smart-crop into fixed slot) | 1–2 hours |
| Self-host fonts as `.woff2` (Playfair Display, DM Sans) in repo | 30 min |
| `POST /api/generate-graphic` route in `server.js` | 1 hour |
| Cloudinary upload + write final URL to sheet column P | 1 hour |
| "Generate Graphic" button on the dashboard card, preview + download | 1 hour |
| Pixel-level tuning against real Canva output (first 5–10 posts) | 2–3 hours |

---

## Prerequisites before any coding

These are the things to confirm/prepare first — none require code:

1. **Re-export both Canva templates as empty-field PNGs.** Same templates as today, but with the heading / subheading / body / CTA / chart slot all removed (transparent or blank). Resolution should be 1080×1350 (the current post format per brief Section 5.4). These become `assets/template-black.png` and `assets/template-white.png` in the repo.
2. **Get a Cloudinary free-tier account** (or pick another permanent image host). Free tier handles plenty for this volume.
3. **Confirm Railway plan has enough RAM** — `sharp` is light (~50MB), so this should be fine on any tier.

---

## Risk register (the things to actively defend against)

| Risk | Likelihood | Fix |
|---|---|---|
| **Telegram chart URL expires after ~1 hour** — already happening today (dashboard shows "Image expired" fallback) | Certain | Upload chart to Cloudinary inside the Make scenario, store permanent URL in column E. This is a *required* fix regardless of the graphic-rendering work |
| Heading overflows bounding box (e.g. 30-char headline vs 7-char design) | Likely | Auto-shrink font size in 2px steps until it fits |
| Body text overflows allocated lines | Possible | Cap word count in brief output spec + auto-shrink as backup |
| Chart aspect ratio doesn't match slot (4:3 vs 16:9 vs tall mobile screenshot) | Possible | Letterbox into fixed slot with background fill, or smart-crop centered |
| Font loading fails / wrong font renders | Unlikely if fonts are self-hosted | Bundle `.woff2` files in repo, reference via `@font-face` in the SVG |
| Two templates have slightly different layouts | Known — confirmed from the PDFs | Build two coordinate maps, one per variant; selector is column N (`bg_variant`) |

---

## What this enables next (downstream ideas)

Once auto-graphics are in, several adjacent features become easy bolt-ons. Capturing these so they don't get lost:

- **One-click cross-platform publishing** via Buffer/Publer/Metricool API — once the image exists, push to scheduling queue with the X/Threads/IG copy already in the sheet. Eliminates the final manual step.
- **Bulk generation** — send 10 charts to Telegram in a row, get 10 finished posts (copy + graphic) for review. The renderer scales trivially.
- **Story-format variants** (1080×1920) — same data, different template PNG. Maybe 2 hours of additional work once the core renderer exists.
- **Performance feedback loop** — track engagement per post, monthly Claude pass suggests brief amendments. Independent of graphics work but compounds the system over time.
- **Auto-posts from existing Make scenarios** — your trade-signals, economic-calendar, and MarketDynamics flows already produce rich data. Could auto-draft Pillar 1 (Performance Proof) and Pillar 5 (Market Commentary) posts and drop them into the same sheet → review → graphic → publish flow.

---

## Open questions for next session

- Confirm the empty-template PNG export is possible from your Canva account (assume yes, just need to do it)
- Decide on permanent image host: Cloudinary (most likely), S3, or Google Drive
- Decide if the dashboard should auto-generate on approval, or stay manual ("Generate" button) for review safety
- Are there other post formats to support eventually (Stories, square, carousels)? Stories is the obvious next; carousels are out of scope for v1 because they're multi-page

---

## Honest reliability assessment

After seeing the actual templates: **99%+ rendering reliability** once the five guards above are in place. The bottleneck is the chart-URL-expiry problem (which already affects you today), not the rendering itself.

For comparison, the current Canva flow is probably ~85% — i.e. ~1 in 6–7 posts has *some* small inconsistency, whether you notice it or not (typo on paste, slightly off image crop, wrong template variant picked, etc.).

This change reverses the pattern: the system becomes the consistent part, you become the reviewer instead of the executor.

---

## One thing I'm NOT recommending here

I am not recommending you eliminate the dashboard review step. The graphic-rendering is automatic, but you still approve each post before it's marked Approved. That keeps you in control of brand voice and quality without you doing the manual graphic assembly. The dashboard becomes the cockpit; the renderer becomes the production line.

---

## File / code touch list (rough)

When this gets built, expect to touch:

- `server.js` — new `POST /api/generate-graphic` route
- `package.json` — add `sharp`, possibly `cloudinary`
- `assets/` (new dir) — `template-black.png`, `template-white.png`, `fonts/PlayfairDisplay-Bold.woff2`, `fonts/DMSans-Regular.woff2`, `fonts/DMSans-Medium.woff2`
- `public/index.html` — "Generate Graphic" button on each card; preview thumbnail; download link
- Make scenario `9160932` (XAU30 Social — 1. Content Generation) — add a step after Telegram download to upload to Cloudinary, use permanent URL in sheet column E
- `CLAUDE.md` — document the new endpoint + assets layout
