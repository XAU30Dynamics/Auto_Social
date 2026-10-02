require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
// Behind Railway's proxy: without this, req.protocol reports "http", and the
// graphic URLs sent to Buffer are http:// — Buffer's publisher follows the
// https redirect so posts publish fine, but the Buffer app/dashboard preview
// can't render an http thumbnail (iOS blocks plain-http), so queued posts LOOK
// like they lost their image.
app.set('trust proxy', 1);
app.use(cors());

// ─── Durable image cache ──────────────────────────────────────────────────────
// Graphic HTML historically embedded Telegram Bot API file URLs, which expire
// (~1h) — graphics then render with a broken-image hole, and because Buffer
// re-fetches /api/graphic/:row.png at every publish slot, a whole week of
// queued posts publishes with the hole (bit us 20-22 Jul 2026). Remote <img>
// srcs are now mirrored into /data/img-cache (Railway volume) when a graphic
// is saved or sent, and the HTML is rewritten to the permanent URL.
const fs = require('fs');
// (crypto is required further down, next to the auth hash that uses it)
const IMG_CACHE_DIR = process.env.IMG_CACHE_DIR || '/data/img-cache';
try { fs.mkdirSync(IMG_CACHE_DIR, { recursive: true }); } catch (e) { console.error('img-cache dir:', e.message); }

const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// Telegram's file endpoint serves images as application/octet-stream, so the
// content-type header can't be trusted — sniff the magic bytes like a browser.
function sniffImageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 6 && buf.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function publicBase() {
  return (process.env.PUBLIC_BASE_URL || 'https://autosocial-production.up.railway.app').replace(/\/$/, '');
}

// Mirrors every remote <img src> (not already ours) into the cache dir.
// Returns { html, mirrored: [url...], failed: [url...] }.
async function mirrorRemoteImages(html) {
  const base = publicBase();
  const srcs = [...new Set(
    [...String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])
  )].filter((u) => /^https?:\/\//i.test(u) && !u.startsWith(base) && !u.includes('/images/'));
  const mirrored = [], failed = [];
  let out = String(html);
  for (const url of srcs) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const type = (resp.headers.get('content-type') || '').split(';')[0].trim();
      const buf = Buffer.from(await resp.arrayBuffer());
      const ext = sniffImageExt(buf) || EXT_BY_TYPE[type];
      if (!ext) throw new Error(`not an image (${type || 'unknown type'})`);
      const name = `${crypto.createHash('sha1').update(buf).digest('hex')}.${ext}`;
      fs.writeFileSync(path.join(IMG_CACHE_DIR, name), buf);
      out = out.split(url).join(`${base}/images/cache/${name}`);
      mirrored.push(url);
    } catch (err) {
      failed.push(`${url.slice(0, 80)} (${err.message})`);
    }
  }
  return { html: out, mirrored, failed };
}
// 40mb: Sealed screenshot uploads arrive as base64 JSON (a few iPhone PNGs).
app.use(express.json({ limit: '40mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images/cache', express.static(IMG_CACHE_DIR, { maxAge: '365d', immutable: true }));

// ─── Dashboard auth ───────────────────────────────────────────────────────────
// Single shared password (DASHBOARD_PASSWORD env). On successful login the
// browser gets a 1-year HttpOnly cookie, so each device logs in once. If the
// env var is unset, auth is disabled entirely (local dev convenience).
// GET /api/graphic/:row.png stays open — Buffer fetches it with no cookies.
const crypto = require('crypto');
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const AUTH_COOKIE = 'sd_auth';
const authToken = DASHBOARD_PASSWORD
  ? crypto.createHash('sha256').update(`sd-dash:${DASHBOARD_PASSWORD}`).digest('hex')
  : '';

function getCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

app.post('/api/login', (req, res) => {
  if (!DASHBOARD_PASSWORD) return res.json({ ok: true });
  if (String(req.body?.password || '') !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const secure = (req.secure || req.get('x-forwarded-proto') === 'https') ? '; Secure' : '';
  res.set('Set-Cookie', `${AUTH_COOKIE}=${authToken}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  if (!DASHBOARD_PASSWORD) return next();
  // GET for the image itself, HEAD for Buffer's URL validation probe.
  if ((req.method === 'GET' || req.method === 'HEAD') && /^\/graphic\/\d+\.(png|jpg)$/.test(req.path)) return next();
  if (getCookie(req, AUTH_COOKIE) === authToken) return next();
  res.status(401).json({ error: 'auth required' });
});

// ─── Google Sheets Auth ───────────────────────────────────────────────────────
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Posts';

// Column index map (0-based)
const COL = {
  timestamp: 0,       // A
  date: 1,            // B
  day: 2,             // C
  pillar: 3,          // D
  image_url: 4,       // E
  headline: 5,        // F
  caption: 6,         // G
  hashtags: 7,        // H
  x_post: 8,          // I
  threads_post: 9,    // J
  status: 10,         // K
  subheading: 11,     // L
  cta_text: 12,       // M
  bg_variant: 13,     // N
  canva_url: 14,      // O
  final_image: 15,    // P
  posted_ig: 16,      // Q
  posted_x: 17,       // R
  posted_threads: 18, // S
  graphic_text: 19,   // T
  graphic_html: 20,   // U — full self-contained 1080×1350 HTML artwork (Claude-designed)
  brand: 21,          // V — 'StrategyDynamics' | 'MarketDynamics' (chosen by the generator; drives IG routing)
};

// ─── GET /api/posts ───────────────────────────────────────────────────────────
app.get('/api/posts', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:V`,
    });

    const rows = response.data.values || [];
    const posts = rows.map((row, index) => {
      const caption = row[COL.caption] || '';
      const hashtags = row[COL.hashtags] || '';
      // Merge caption + hashtags for the dashboard — single block, ready to copy.
      // Idempotent: saving writes the merged text back into the caption column, so
      // only append hashtags when they're not already present (else they double up).
      const captionWithHashtags = (hashtags && !caption.includes(hashtags))
        ? `${caption}\n\n${hashtags}`
        : caption;

      return {
        rowIndex: index + 2,
        timestamp: row[COL.timestamp] || '',
        date: row[COL.date] || '',
        day: row[COL.day] || '',
        pillar: row[COL.pillar] || '',
        image_url: row[COL.image_url] || '',
        headline: row[COL.headline] || '',
        caption: captionWithHashtags,
        x_post: row[COL.x_post] || '',
        threads_post: row[COL.threads_post] || '',
        status: row[COL.status] || '',
        subheading: row[COL.subheading] || '',
        cta_text: row[COL.cta_text] || '',
        bg_variant: row[COL.bg_variant] || '',
        canva_url: row[COL.canva_url] || '',
        final_image: row[COL.final_image] || '',
        posted_ig: row[COL.posted_ig] || '',
        posted_x: row[COL.posted_x] || '',
        posted_threads: row[COL.posted_threads] || '',
        graphic_text: row[COL.graphic_text] || '',
        graphic_html: row[COL.graphic_html] || '',
        brand: row[COL.brand] || '',
      };
    });

    res.json(posts.reverse());
  } catch (err) {
    console.error('GET /api/posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/posts/:row ────────────────────────────────────────────────────
app.patch('/api/posts/:row', async (req, res) => {
  const rowIndex = parseInt(req.params.row);
  const updates = req.body;

  try {
    // Mirror any remote images into the durable cache the moment a graphic is
    // saved — Telegram file URLs are already dying by the hour at this point.
    let imageWarnings;
    if (typeof updates.graphic_html === 'string' && updates.graphic_html.includes('<img')) {
      const m = await mirrorRemoteImages(updates.graphic_html);
      updates.graphic_html = m.html;
      if (m.failed.length) {
        imageWarnings = m.failed;
        console.warn(`PATCH row ${rowIndex}: could not mirror ${m.failed.length} image(s): ${m.failed.join('; ')}`);
      }
      if (m.mirrored.length) console.log(`PATCH row ${rowIndex}: mirrored ${m.mirrored.length} remote image(s) to cache`);
    }

    const sheets = getSheetsClient();
    const data = [];

    for (const [field, value] of Object.entries(updates)) {
      if (COL[field] === undefined) continue;
      const colLetter = String.fromCharCode(65 + COL[field]);
      data.push({
        range: `${SHEET_NAME}!${colLetter}${rowIndex}`,
        values: [[value]],
      });
    }

    if (data.length === 0) return res.json({ ok: true });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    });

    res.json(imageWarnings ? { ok: true, imageWarnings } : { ok: true });
  } catch (err) {
    console.error('PATCH /api/posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/threads/generate ───────────────────────────────────────────────
// Proxies {topic, pillar} to the Make "Thread Generator" webhook (Claude + brief),
// keeping the webhook URL server-side. Returns the parsed thread chain JSON.
const THREAD_WEBHOOK_URL = process.env.MAKE_THREAD_WEBHOOK_URL;

app.post('/api/threads/generate', async (req, res) => {
  const topic = String(req.body?.topic || '').trim();
  const pillar = String(req.body?.pillar || '').trim();
  if (!topic) return res.status(400).json({ error: 'Topic is required' });
  if (!THREAD_WEBHOOK_URL) {
    return res.status(500).json({ error: 'MAKE_THREAD_WEBHOOK_URL is not set on the server' });
  }

  // Total posts in the chain (hook + replies + CTA). 1 = single standalone post;
  // anything else clamps to the 3–15 chain range.
  const requested = parseInt(req.body?.count, 10) || 7;
  const total = requested === 1 ? 1 : Math.min(15, Math.max(3, requested));
  // Fold an authoritative length instruction into the topic the webhook reads.
  // This overrides the default range baked into the Make/Claude prompt without
  // requiring a scenario edit (which would unbind the webhook).
  let topicForGen;
  if (total === 1) {
    topicForGen =
      `${topic}\n\n[LENGTH INSTRUCTION — this takes precedence over any default post-count range or chain structure stated elsewhere: ` +
      `produce a SINGLE standalone Threads post, NOT a chain. Put the ENTIRE post in the "hook" field — it must stand alone: ` +
      `a hook opening, the core idea, and exactly one short CTA from the brief's CTA library folded into the same post. ` +
      `It may be up to 500 characters, and unlike a chain hook it MAY include the CTA/link. ` +
      `The "posts" array MUST be empty ([]), "cta" MUST be an empty string, and "total_posts" must equal 1.]`;
  } else {
    const replies = total - 2; // one hook + N numbered replies + one CTA
    topicForGen =
      `${topic}\n\n[LENGTH INSTRUCTION — this takes precedence over any default post-count range stated elsewhere: ` +
      `produce a chain of EXACTLY ${total} posts total — 1 hook post, then EXACTLY ${replies} numbered reply posts ` +
      `in the "posts" array, then 1 CTA post. "total_posts" must equal ${total}.]`;
  }

  try {
    const upstream = await fetch(THREAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topicForGen, pillar, count: total }),
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      console.error('Thread webhook error:', upstream.status, raw.slice(0, 300));
      return res.status(502).json({ error: `Generator returned ${upstream.status}`, detail: raw.slice(0, 300) });
    }

    const thread = parseThread(raw);
    if (!thread) {
      return res.status(502).json({ error: 'Could not parse generator response', detail: raw.slice(0, 300) });
    }
    res.json(thread);
  } catch (err) {
    console.error('POST /api/threads/generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Defensively extract the thread JSON from the webhook body (handles raw JSON or ```fences).
function parseThread(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    try { obj = JSON.parse(text.slice(s, e + 1)); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const posts = Array.isArray(obj.posts) ? obj.posts.map((p) => String(p)) : [];
  return {
    pillar: obj.pillar || '',
    topic_tag: obj.topic_tag || '',
    hook: obj.hook || '',
    posts,
    cta: obj.cta || '',
    total_posts: obj.total_posts || (posts.length + (obj.hook ? 1 : 0) + (obj.cta ? 1 : 0)),
  };
}

// ─── POST /api/graphic/render ─────────────────────────────────────────────────
// Body: { html } — a full, self-contained HTML document designed at 1080×1350.
// Renders it in headless Chromium and returns a pixel-exact 1080×1350 PNG.
// Puppeteer is required lazily so a Chromium install hiccup can't take down the
// rest of the dashboard (posts/threads keep working even if rendering is down).
const GRAPHIC_W = 1080;
const GRAPHIC_H = 1350;
let browserPromise = null;

// The generator's prompt mandates the brand logo render at height:56px/width:auto,
// but being a prompt rule it's occasionally ignored (logo stretched into a
// full-width header banner). Enforce it deterministically at render time instead:
// inject a style override targeting the hosted brand-logo images. The saved
// graphic_html in the sheet is never modified — only the rendered output.
const LOGO_GUARD_STYLE =
  "<style>img[src*='/images/brand/'][src*='-logo']{height:56px !important;width:auto !important;" +
  "max-width:none !important;min-width:0 !important;object-fit:contain !important;flex:none !important;" +
  // Left-align regardless of container centring: block + margin-right:auto beats
  // text-align:center and flex justify-content:center; justify-self covers grid.
  "display:block !important;margin-left:0 !important;margin-right:auto !important;" +
  "align-self:flex-start !important;justify-self:start !important;}</style>";

function injectLogoGuard(html) {
  const i = html.search(/<\/head\s*>/i);
  if (i !== -1) return html.slice(0, i) + LOGO_GUARD_STYLE + html.slice(i);
  return LOGO_GUARD_STYLE + html;
}

async function getBrowser() {
  const puppeteer = require('puppeteer');
  // Reuse one browser across requests; relaunch if it died/disconnected.
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (b.connected !== false && b.process() !== null) return b;
    } catch { /* fall through to relaunch */ }
  }
  browserPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--hide-scrollbars',
    ],
  });
  return browserPromise;
}

// Render a full 1080×1350 HTML document to a PNG Buffer. Puppeteer v24 returns a
// Uint8Array, so callers get a Node Buffer (res.send would JSON-serialize a raw
// Uint8Array into {"0":137,...}).
async function renderHtmlToPng(html, type = 'png') {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    // deviceScaleFactor 1 → the PNG is exactly 1080×1350 (Instagram portrait).
    await page.setViewport({ width: GRAPHIC_W, height: GRAPHIC_H, deviceScaleFactor: 1 });
    // domcontentloaded (not networkidle0): a single stalled font/image request
    // must never hang the render. We then explicitly wait for fonts + images
    // with hard caps so text/images are painted before the screenshot.
    await page.setContent(injectLogoGuard(html), { waitUntil: 'domcontentloaded', timeout: 20000 });
    try {
      await page.evaluate(async () => {
        const cap = (ms) => new Promise((r) => setTimeout(r, ms));
        if (document.fonts && document.fonts.ready) {
          await Promise.race([document.fonts.ready, cap(4000)]);
        }
        const pending = Array.from(document.images).filter((i) => !i.complete);
        await Promise.race([
          Promise.all(pending.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))),
          cap(4000),
        ]);
      });
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
    const png = await page.screenshot({
      type: type === 'jpeg' ? 'jpeg' : 'png',
      ...(type === 'jpeg' ? { quality: 92 } : {}),
      clip: { x: 0, y: 0, width: GRAPHIC_W, height: GRAPHIC_H },
    });
    return Buffer.from(png);
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

// Re-encode an uploaded image as JPEG through Chromium (no native image deps):
// TikTok photo posts reject PNG, and iPhone screenshots are PNG. The image is
// drawn at its natural size on a page of the same size and screenshotted.
async function imageToJpeg(buf, mime) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000"><img id="i" src="${dataUrl}" style="display:block"></body></html>`, { waitUntil: 'load', timeout: 20000 });
    const dims = await page.evaluate(() => {
      const i = document.getElementById('i');
      return { w: i.naturalWidth, h: i.naturalHeight };
    });
    if (!dims.w || !dims.h) throw new Error('image failed to decode');
    await page.setViewport({ width: dims.w, height: dims.h, deviceScaleFactor: 1 });
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: dims.w, height: dims.h } });
    return { jpg: Buffer.from(jpg), width: dims.w, height: dims.h };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

// Read a single cell (e.g. graphic_html for one row) as a string.
async function readCell(a1) {
  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!${a1}` });
  return ((resp.data.values || [])[0] || [])[0] || '';
}

app.post('/api/graphic/render', async (req, res) => {
  const html = String(req.body?.html || '').trim();
  if (!html) return res.status(400).json({ error: 'html is required' });
  try {
    const png = await renderHtmlToPng(html);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (err) {
    console.error('POST /api/graphic/render error:', err.message);
    res.status(502).json({ error: 'Render failed', detail: err.message });
  }
});

// ─── GET /api/graphic/:row.png ────────────────────────────────────────────────
// Renders the saved graphic_html for a post row to a PNG at a STABLE URL, so
// Buffer (and anything else) can fetch the image by link. Reads from the sheet,
// so save edits before relying on it.
// .jpg variant exists for TikTok, whose photo posts reject PNG.
app.get(['/api/graphic/:row.png', '/api/graphic/:row.jpg'], async (req, res) => {
  const row = parseInt(req.params.row, 10);
  const jpeg = req.path.endsWith('.jpg');
  if (!row || row < 2) return res.status(400).send('bad row');
  try {
    const colU = String.fromCharCode(65 + COL.graphic_html); // 'U'
    const html = String(await readCell(`${colU}${row}`)).trim();
    if (!html) return res.status(404).send('no graphic on this post');
    const img = await renderHtmlToPng(html, jpeg ? 'jpeg' : 'png');
    res.set('Content-Type', jpeg ? 'image/jpeg' : 'image/png');
    res.set('Cache-Control', 'public, max-age=600'); // let Buffer fetch it
    res.send(img);
  } catch (err) {
    console.error('GET /api/graphic/:row error:', err.message);
    res.status(502).send('render failed');
  }
});

// ─── Buffer channels ──────────────────────────────────────────────────────────
// ONE map of every Buffer channel, keyed by brand then platform. Adding a channel
// = adding one line here (ids from Buffer's list_channels). An empty string means
// "not connected yet" — the dashboard greys that button out and sends skip it.
// X was dropped 2 Oct 2026 (zero engagement); MarketDynamics' Instagram was
// removed from Buffer the same day but the brand stays in the data model so a
// new channel can be slotted straight back in.
const BUFFER_TOKEN = process.env.BUFFER_TOKEN;
const BRANDS = {
  StrategyDynamics: {
    label: 'StrategyDynamics',
    link: 'https://strategydynamics.co.uk',   // Shop Grid URL on Instagram posts
    channels: {
      instagram: '6a4bbf26404834462876b88b', // strategy_dynamics
      threads:   '6a4b8557404834462875a0b7', // strategy_dynamics
      tiktok:    '6abf4f2fea19ca0bde50319b', // strategydynamics
    },
  },
  MarketDynamics: {
    label: 'MarketDynamics',
    link: 'https://strategydynamics.co.uk',
    channels: {
      instagram: '', // marketdynamics_app — removed from Buffer 1 Oct 2026
      threads:   '',
      tiktok:    '',
    },
  },
  Sealed: {
    label: 'Sealed',
    link: 'https://apps.apple.com/gb/app/sealed-workout-habit-tracker/id6807351225',
    channels: {
      instagram: '6abf503eea19ca0bde5037d7', // earntheclose
      tiktok:    '6abf508cea19ca0bde503994', // earntheclose
      threads:   '', // earntheclose — not connected yet (Buffer/Meta auth pending)
    },
  },
};
const PLATFORMS = ['instagram', 'threads', 'tiktok'];

function brandKey(name) {
  const s = String(name || '').toLowerCase();
  if (s.includes('seal')) return 'Sealed';
  if (s.includes('market')) return 'MarketDynamics';
  return 'StrategyDynamics';
}

// GET /api/channels — what the dashboard renders its send buttons from.
app.get('/api/channels', (req, res) => {
  const out = {};
  for (const [k, b] of Object.entries(BRANDS)) {
    out[k] = { label: b.label, link: b.link, channels: {} };
    for (const p of PLATFORMS) out[k].channels[p] = !!b.channels[p];
  }
  res.json({ brands: out, platforms: PLATFORMS });
});

// ─── POST /api/buffer/send/:row ───────────────────────────────────────────────
// Sends a reviewed StrategyDynamics/MarketDynamics post to Buffer. Body:
// { channels?: ['instagram','threads','tiktok'], mode?: 'now'|'queue' }. Routes
// every platform by the row's brand via BRANDS. The graphic is attached as an
// image URL Buffer fetches (GET /api/graphic/:row.png — .jpg for TikTok, whose
// photo posts reject PNG).

// imageUrls: array of public image URLs (1..n → carousel on IG, photo set on
// TikTok, single image on Threads). link: Instagram Shop Grid URL for the post.
// tiktokTitle: the bold title TikTok shows above the caption (≤ 90 chars).
async function bufferCreatePost({ channelId, text, imageUrl, imageUrls, mode, platform, thread, threadsTopic, link, tiktokTitle }) {
  const urls = (imageUrls && imageUrls.length) ? imageUrls : (imageUrl ? [imageUrl] : []);
  const input = {
    channelId,
    schedulingType: 'automatic',
    mode: mode === 'now' ? 'shareNow' : 'addToQueue',
    text: text || '',
    assets: urls.map((u) => ({ image: { url: u } })),
  };
  // Instagram requires post metadata (type + shouldShareToFeed); Threads doesn't.
  // `link` is the Shop Grid URL — tapping the post on the link-in-bio grid opens it.
  if (platform === 'instagram') {
    // type stays 'post' for carousels too — Buffer infers carousel from multiple assets
    // ("Instagram does not support the 'carousel' post type", verified 2 Oct 2026).
    input.metadata = { instagram: { type: 'post', shouldShareToFeed: true, ...(link ? { link } : {}) } };
  }
  if (platform === 'tiktok') {
    input.metadata = { tiktok: { title: String(tiktokTitle || text || '').split('\n')[0].slice(0, 90) } };
  }
  // Threads chain: metadata.threads.thread is the SOURCE OF TRUTH for what gets
  // published and must contain EVERY post INCLUDING the root as its first element
  // (matching the top-level text) — Buffer publishes the array, not `text`
  // (contract clarified in Buffer's 16 Jun 2026 API changelog; sending only the
  // replies makes the chain publish without its hook). `topic` sets the Threads
  // topic tag shown beside the account name.
  if ((thread && thread.length) || threadsTopic) {
    const threads = {};
    if (thread && thread.length) threads.thread = thread.map((t) => ({ text: t, assets: [] }));
    if (threadsTopic) threads.topic = threadsTopic;
    input.metadata = { ...(input.metadata || {}), threads };
  }
  const query = 'mutation($input:CreatePostInput!){createPost(input:$input){__typename ... on PostActionSuccess{post{id}} ... on MutationError{message}}}';
  const resp = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BUFFER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { input } }),
  });
  const json = await resp.json().catch(() => ({}));
  const cp = json?.data?.createPost;
  if (cp?.__typename === 'PostActionSuccess') return { ok: true, id: cp.post?.id };
  const error = cp?.message || json?.errors?.[0]?.message || `HTTP ${resp.status}${cp?.__typename ? ' ' + cp.__typename : ''}`;
  if (!cp) console.error('buffer createPost unexpected response:', JSON.stringify(json).slice(0, 500));
  return { ok: false, error };
}

app.post('/api/buffer/send/:row', async (req, res) => {
  if (!BUFFER_TOKEN) return res.status(500).json({ error: 'BUFFER_TOKEN is not set on the server' });
  const row = parseInt(req.params.row, 10);
  if (!row || row < 2) return res.status(400).json({ error: 'bad row' });
  const wanted = Array.isArray(req.body?.channels) && req.body.channels.length
    ? req.body.channels : PLATFORMS;
  const mode = req.body?.mode === 'now' ? 'now' : 'queue';

  try {
    const sheets = getSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${row}:V${row}`,
    });
    const r = (resp.data.values || [])[0] || [];
    let graphicHtml = String(r[COL.graphic_html] || '').trim();
    if (!graphicHtml) return res.status(400).json({ error: 'This post has no graphic to send' });

    // Last line of defence: mirror remote images now and persist the rewritten
    // HTML, so every later Buffer publish-time render uses the durable copies.
    // A dead embedded image means the card would publish with a broken-image
    // hole all week — refuse to send unless explicitly forced.
    if (graphicHtml.includes('<img')) {
      const m = await mirrorRemoteImages(graphicHtml);
      if (m.failed.length && !req.body?.force) {
        return res.status(400).json({
          error: `Embedded image(s) unreachable — the graphic would publish with a broken-image hole. Re-attach the screenshot and regenerate, or pass force:true to send anyway. Failed: ${m.failed.join('; ')}`,
        });
      }
      if (m.html !== graphicHtml) {
        graphicHtml = m.html;
        const colU = String.fromCharCode(65 + COL.graphic_html);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!${colU}${row}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[graphicHtml]] },
        });
        console.log(`buffer/send row ${row}: mirrored ${m.mirrored.length} image(s), sheet updated`);
      }
    }

    const brand = brandKey(r[COL.brand]);
    const B = BRANDS[brand];
    const caption = r[COL.caption] || '';
    const hashtags = r[COL.hashtags] || '';
    // Idempotent: the caption column may already contain the hashtags (saved from
    // the merged dashboard field), so only append them if they're not already there.
    const igText = (hashtags && !caption.includes(hashtags)) ? `${caption}\n\n${hashtags}` : caption;
    // Threads: a single trailing hashtag becomes the linked topic tag (sent via
    // metadata.threads.topic) and is stripped from the text — inline hashtags
    // don't link on Threads.
    let threadsText = r[COL.threads_post] || '';
    let threadsTopic;
    const tagMatch = threadsText.match(/(?:^|\s)#(\w+)\s*$/);
    if (tagMatch) {
      threadsTopic = tagMatch[1];
      threadsText = threadsText.slice(0, tagMatch.index).trimEnd();
    }
    // TikTok: headline as the bold title, caption (with tags) underneath.
    const tiktokTitle = r[COL.headline] || '';

    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const pngUrl = `${base}/api/graphic/${row}.png`;
    const jpgUrl = `${base}/api/graphic/${row}.jpg`;

    const plan = [];
    if (wanted.includes('instagram')) plan.push(['instagram', igText, pngUrl]);
    if (wanted.includes('threads')) plan.push(['threads', threadsText, pngUrl]);
    if (wanted.includes('tiktok')) plan.push(['tiktok', igText, jpgUrl]);

    const results = {};
    // Sequential so Buffer fetches the image URL one at a time (kinder on render).
    for (const [name, text, imageUrl] of plan) {
      const channelId = B.channels[name];
      if (!channelId) { results[name] = { ok: false, error: `${brand} has no ${name} channel in Buffer` }; continue; }
      results[name] = await bufferCreatePost({
        channelId, text, imageUrl, mode, platform: name,
        threadsTopic: name === 'threads' ? threadsTopic : undefined,
        link: name === 'instagram' ? B.link : undefined,
        tiktokTitle,
      });
    }
    res.json({ ok: true, brand, mode, results });
  } catch (err) {
    console.error('POST /api/buffer/send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/threads/send ───────────────────────────────────────────────────
// Sends a generated thread (from the Thread Generator) straight to the Threads
// channel via Buffer. Body: { hook, posts?: [], cta?, topic_tag?, mode?: 'now'|'queue' }.
// The whole chain goes up in ONE createPost (root = hook, replies in order, CTA
// last), so there's no partial-post risk. Threads rejects any post over 500 chars
// and that fails the entire chain, so every post is hard-clamped as a safety net.
app.post('/api/threads/send', async (req, res) => {
  if (!BUFFER_TOKEN) return res.status(500).json({ error: 'BUFFER_TOKEN is not set on the server' });
  const hook = String(req.body?.hook || '').trim();
  if (!hook) return res.status(400).json({ error: 'hook is required' });
  const posts = Array.isArray(req.body?.posts)
    ? req.body.posts.map((p) => String(p).trim()).filter(Boolean) : [];
  const cta = String(req.body?.cta || '').trim();
  const mode = req.body?.mode === 'now' ? 'now' : 'queue';
  const clamp = (s) => (s.length > 500 ? s.slice(0, 497) + '…' : s);
  // The Threads topic tag is set via metadata.threads.topic (no # symbol) — it
  // shows beside the account name. Inline hashtags don't link on Threads, so we
  // never put the tag in the post text.
  const tag = String(req.body?.topic_tag || '').replace(/^#/, '').trim();

  try {
    // Full chain, root first — Buffer publishes metadata.threads.thread verbatim.
    const chain = [hook, ...posts, ...(cta ? [cta] : [])].map(clamp);
    const result = await bufferCreatePost({
      channelId: BRANDS.StrategyDynamics.channels.threads,
      text: chain[0],
      mode,
      platform: 'threads',
      thread: chain,
      threadsTopic: tag || undefined,
    });
    if (!result.ok) return res.status(502).json(result);
    res.json({ ok: true, id: result.id, mode, total: chain.length });
  } catch (err) {
    console.error('POST /api/threads/send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Sealed ───────────────────────────────────────────────────────────────────
// Screenshot-first workflow for the Sealed app (no graphic engine): upload
// screenshots → one-line note → Claude writes per-platform captions from the
// SEALED_BRIEF.md brand brief AND the images themselves → edit → send to Buffer.
// Posts live in the `Sealed` tab of the same spreadsheet (auto-created).
const SEALED_SHEET = 'Sealed';
const SEALED_HEADER = ['created_at', 'note', 'angle', 'images', 'hook', 'ig_caption', 'tiktok_title',
  'tiktok_caption', 'threads_text', 'threads_topic', 'status', 'sent_instagram', 'sent_tiktok',
  'sent_threads', 'buffer_ids', 'link'];
const SEALED_COL = Object.fromEntries(SEALED_HEADER.map((k, i) => [k, i]));
const SEALED_EDITABLE = new Set(['note', 'angle', 'hook', 'ig_caption', 'tiktok_title', 'tiktok_caption',
  'threads_text', 'threads_topic', 'status', 'link', 'images']);

async function ensureSealedTab(sheets) {
  try {
    await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SEALED_SHEET}!A1` });
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SEALED_SHEET } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${SEALED_SHEET}!A1`,
      valueInputOption: 'RAW', requestBody: { values: [SEALED_HEADER] },
    });
  }
}

function sealedRowToPost(row, index) {
  const o = { rowIndex: index + 2 };
  for (const k of SEALED_HEADER) o[k] = row[SEALED_COL[k]] || '';
  try { o.images = JSON.parse(o.images || '[]'); } catch { o.images = []; }
  try { o.buffer_ids = JSON.parse(o.buffer_ids || '{}'); } catch { o.buffer_ids = {}; }
  return o;
}

// POST /api/sealed/upload — body { images: [{ data: <base64>, name? }] }.
// Stores each screenshot in the durable image cache (Railway volume) as JPEG
// (TikTok rejects PNG; IG/Threads are happy with JPEG) and returns public URLs.
app.post('/api/sealed/upload', async (req, res) => {
  const items = Array.isArray(req.body?.images) ? req.body.images : [];
  if (!items.length) return res.status(400).json({ error: 'no images' });
  if (items.length > 10) return res.status(400).json({ error: 'max 10 images per post' });
  const base = publicBase();
  const out = [];
  try {
    for (const it of items) {
      const raw = String(it.data || '').replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      const ext = sniffImageExt(buf);
      if (!ext) throw new Error('not an image');
      const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext];
      let jpg = buf, width = 0, height = 0;
      if (ext !== 'jpg') ({ jpg, width, height } = await imageToJpeg(buf, mime));
      const name = `${crypto.createHash('sha1').update(jpg).digest('hex')}.jpg`;
      fs.writeFileSync(path.join(IMG_CACHE_DIR, name), jpg);
      out.push({ url: `${base}/images/cache/${name}`, width, height, bytes: jpg.length });
    }
    res.json({ ok: true, images: out });
  } catch (err) {
    console.error('POST /api/sealed/upload error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/sealed/generate — body { note, angle?, images?: [urls] }.
// Claude (official SDK) reads SEALED_BRIEF.md + the screenshots and returns
// structured per-platform captions. Nothing is saved here — the dashboard
// shows the result for editing and saves on "Save" / "Send".
const SEALED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hook', 'instagram', 'tiktok', 'threads', 'what_i_see'],
  properties: {
    what_i_see: { type: 'string', description: 'One line: what the screenshot(s) literally show. Not published.' },
    hook: { type: 'string', description: 'The single sharpest first line, ≤ 90 chars. Reused as the TikTok title.' },
    instagram: {
      type: 'object', additionalProperties: false, required: ['caption', 'hashtags'],
      properties: {
        caption: { type: 'string', description: 'Full IG caption WITHOUT hashtags. Hook on line 1, line breaks between ideas, ends with the CTA.' },
        hashtags: { type: 'array', items: { type: 'string' }, description: '3-5 hashtags, each starting with #.' },
      },
    },
    tiktok: {
      type: 'object', additionalProperties: false, required: ['title', 'caption', 'hashtags'],
      properties: {
        title: { type: 'string', description: '≤ 90 chars, the hook.' },
        caption: { type: 'string', description: 'Short conversational caption WITHOUT hashtags, 120-300 chars, ends with a soft CTA.' },
        hashtags: { type: 'array', items: { type: 'string' }, description: '3-5 hashtags, each starting with #.' },
      },
    },
    threads: {
      type: 'object', additionalProperties: false, required: ['text', 'topic_tag'],
      properties: {
        text: { type: 'string', description: '≤ 500 chars, aim 120-280, NO hashtags. Ends with a soft CTA or an open question.' },
        topic_tag: { type: 'string', description: 'One topic tag without the #, e.g. fitnessapp.' },
      },
    },
  },
};

let sealedBriefCache = { text: '', mtime: 0 };
function loadSealedBrief() {
  const p = path.join(__dirname, 'SEALED_BRIEF.md');
  try {
    const st = fs.statSync(p);
    if (st.mtimeMs !== sealedBriefCache.mtime) sealedBriefCache = { text: fs.readFileSync(p, 'utf8'), mtime: st.mtimeMs };
  } catch (e) { console.error('SEALED_BRIEF.md:', e.message); }
  return sealedBriefCache.text;
}

app.post('/api/sealed/generate', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server' });
  const note = String(req.body?.note || '').trim();
  const angle = String(req.body?.angle || 'hook').trim();
  const images = (Array.isArray(req.body?.images) ? req.body.images : []).filter((u) => /^https?:\/\//.test(u)).slice(0, 10);
  if (!note && !images.length) return res.status(400).json({ error: 'Add a screenshot or a note first' });
  const brief = loadSealedBrief();
  if (!brief) return res.status(500).json({ error: 'SEALED_BRIEF.md missing' });

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();
    // Images go in as base64 (the cache URL is public, but base64 avoids a
    // round-trip through our own host and works for a local dev server too).
    const content = [];
    for (const u of images) {
      try {
        const m = /\/images\/cache\/([a-f0-9]+\.(jpg|png|webp|gif))$/.exec(u);
        let buf, mime;
        if (m) { buf = fs.readFileSync(path.join(IMG_CACHE_DIR, m[1])); }
        else { const r = await fetch(u, { signal: AbortSignal.timeout(10000) }); buf = Buffer.from(await r.arrayBuffer()); }
        const ext = sniffImageExt(buf);
        mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext];
        if (mime) content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: buf.toString('base64') } });
      } catch (e) { console.warn('sealed/generate: skip image', u, e.message); }
    }
    content.push({
      type: 'text',
      text: `Write the social captions for ONE Sealed post.\n\nANGLE: ${angle}\n\nWHAT THIS POST IS ABOUT (from Sean): ${note || '(no note — go entirely off the screenshots)'}\n\n` +
        `There ${content.length === 1 ? 'is 1 screenshot' : `are ${content.length} screenshots`} attached${content.length ? ' — read them closely and make the captions about what is ACTUALLY on screen (numbers, labels, the arc or screen shown). Never describe something that is not visible.' : '.'}\n\n` +
        'Follow the brief exactly: voice, banned words, price wording, hashtag counts, platform lengths. Hashtags go ONLY in the hashtags arrays, never inside caption text. UK spelling. Return the JSON only.',
    });

    const response = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SEALED_SCHEMA } },
      system: [{ type: 'text', text: `You write social media captions for the Sealed app. The brand brief below is your only source of truth.\n\n=== SEALED BRIEF ===\n\n${brief}`, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') return res.status(502).json({ error: 'Model declined this request' });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let out;
    try { out = JSON.parse(text); } catch { return res.status(502).json({ error: 'Bad JSON from model', detail: text.slice(0, 300) }); }
    const tidyTags = (a) => (Array.isArray(a) ? a : []).map((t) => '#' + String(t).replace(/^#/, '').replace(/\s+/g, '')).filter((t) => t.length > 1).slice(0, 5);
    res.json({
      ok: true,
      what_i_see: out.what_i_see || '',
      hook: out.hook || '',
      ig_caption: `${(out.instagram?.caption || '').trim()}\n\n${tidyTags(out.instagram?.hashtags).join(' ')}`.trim(),
      tiktok_title: (out.tiktok?.title || out.hook || '').slice(0, 90),
      tiktok_caption: `${(out.tiktok?.caption || '').trim()} ${tidyTags(out.tiktok?.hashtags).join(' ')}`.trim(),
      threads_text: (out.threads?.text || '').trim(),
      threads_topic: String(out.threads?.topic_tag || '').replace(/^#/, '').trim(),
      usage: response.usage,
    });
  } catch (err) {
    console.error('POST /api/sealed/generate error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /api/sealed/posts — newest first.
app.get('/api/sealed/posts', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    await ensureSealedTab(sheets);
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SEALED_SHEET}!A2:P` });
    const rows = resp.data.values || [];
    res.json(rows.map(sealedRowToPost).reverse());
  } catch (err) {
    console.error('GET /api/sealed/posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function sealedValues(body) {
  const v = {};
  for (const k of SEALED_EDITABLE) {
    if (body[k] === undefined) continue;
    v[k] = k === 'images' ? JSON.stringify(Array.isArray(body[k]) ? body[k] : []) : String(body[k] ?? '');
  }
  return v;
}

// POST /api/sealed/posts — create a draft row. Returns its rowIndex.
app.post('/api/sealed/posts', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    await ensureSealedTab(sheets);
    const v = sealedValues(req.body || {});
    const row = SEALED_HEADER.map((k) => v[k] ?? '');
    row[SEALED_COL.created_at] = new Date().toISOString();
    row[SEALED_COL.status] = v.status || 'Draft';
    row[SEALED_COL.link] = v.link || BRANDS.Sealed.link;
    const r = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, range: `${SEALED_SHEET}!A1`,
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] },
    });
    const m = /!A(\d+)/.exec(r.data.updates?.updatedRange || '');
    res.json({ ok: true, rowIndex: m ? parseInt(m[1], 10) : null });
  } catch (err) {
    console.error('POST /api/sealed/posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sealed/posts/:row — per-field update, same contract as /api/posts.
app.patch('/api/sealed/posts/:row', async (req, res) => {
  const row = parseInt(req.params.row, 10);
  if (!row || row < 2) return res.status(400).json({ error: 'bad row' });
  try {
    const v = sealedValues(req.body || {});
    const data = Object.entries(v).map(([k, val]) => ({
      range: `${SEALED_SHEET}!${String.fromCharCode(65 + SEALED_COL[k])}${row}`, values: [[val]],
    }));
    if (!data.length) return res.json({ ok: true });
    await getSheetsClient().spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'RAW', data },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/sealed/posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sealed/send/:row — body { channels?: [...], mode?: 'now'|'queue' }.
// Reads the saved row (save first!), posts to each requested Sealed channel with
// the screenshots attached, records Buffer ids + sent timestamps on the row.
app.post('/api/sealed/send/:row', async (req, res) => {
  if (!BUFFER_TOKEN) return res.status(500).json({ error: 'BUFFER_TOKEN is not set on the server' });
  const row = parseInt(req.params.row, 10);
  if (!row || row < 2) return res.status(400).json({ error: 'bad row' });
  const wanted = Array.isArray(req.body?.channels) && req.body.channels.length ? req.body.channels : PLATFORMS;
  const mode = req.body?.mode === 'now' ? 'now' : 'queue';
  try {
    const sheets = getSheetsClient();
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SEALED_SHEET}!A${row}:P${row}` });
    const p = sealedRowToPost((resp.data.values || [])[0] || [], row - 2);
    if (!p.images.length) return res.status(400).json({ error: 'This post has no screenshots' });
    const B = BRANDS.Sealed;
    const plan = [];
    if (wanted.includes('instagram')) plan.push(['instagram', p.ig_caption]);
    if (wanted.includes('tiktok')) plan.push(['tiktok', p.tiktok_caption]);
    if (wanted.includes('threads')) plan.push(['threads', p.threads_text]);
    const results = {};
    const now = new Date().toISOString();
    const updates = {};
    for (const [name, text] of plan) {
      const channelId = B.channels[name];
      if (!channelId) { results[name] = { ok: false, error: `Sealed has no ${name} channel in Buffer yet` }; continue; }
      results[name] = await bufferCreatePost({
        channelId, text, imageUrls: name === 'threads' ? p.images.slice(0, 1) : p.images, mode, platform: name,
        threadsTopic: name === 'threads' ? (p.threads_topic || undefined) : undefined,
        link: name === 'instagram' ? (p.link || B.link) : undefined,
        tiktokTitle: p.tiktok_title || p.hook,
      });
      if (results[name].ok) { updates[`sent_${name}`] = now; p.buffer_ids[name] = results[name].id; }
    }
    if (Object.keys(updates).length) {
      updates.buffer_ids = JSON.stringify(p.buffer_ids);
      updates.status = 'Sent';
      const data = Object.entries(updates).map(([k, val]) => ({
        range: `${SEALED_SHEET}!${String.fromCharCode(65 + SEALED_COL[k])}${row}`, values: [[val]],
      }));
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'RAW', data } });
    }
    res.json({ ok: true, mode, results });
  } catch (err) {
    console.error('POST /api/sealed/send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/threadlog ───────────────────────────────────────────────────────
// Recent auto-posted threads for the dashboard's "Auto Threads" panel.
// Reads the `ThreadLog` tab (A ts YYYYMMDD-HHmmss, B pillar, C topic, D hook,
// E total_posts, F root_post_id) and returns the last 24 hours, newest first.
// Non-fatal: any read error (e.g. tab absent) returns [] so the panel just shows
// its empty state rather than an error.
function parseThreadTs(s) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

app.get('/api/threadlog', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'ThreadLog!A2:G',
    });
    const rows = response.data.values || [];
    const cutoff = Date.now() - 86400 * 1000;
    const items = rows
      .map((r) => ({
        ts: r[0] || '',
        pillar: r[1] || '',
        topic: r[2] || '',
        hook: r[3] || '',
        total_posts: r[4] || '',
        root_post_id: r[5] || '',
        thread_text: r[6] || '',
      }))
      .filter((it) => {
        const d = parseThreadTs(it.ts);
        return d && d.getTime() >= cutoff;
      })
      .reverse();
    res.json(items);
  } catch (err) {
    console.error('GET /api/threadlog error:', err.message);
    res.json([]);
  }
});

// ─── Insights (Buffer engagement metrics) ─────────────────────────────────────
// Two independent, deliberately-dumb pieces (neither can affect posting):
//  1. A background collector that snapshots each sent post's metrics to the
//     `Insights` sheet tab ONCE, after the post is 7 days old (metrics matured).
//     Append-only, self-healing (window = newest logged sent_at → now-7d), no
//     state outside the sheet itself. Any error is logged and skipped.
//  2. GET /api/insights — live 30-day rollup straight from Buffer for the
//     dashboard panel. Read-only.
const BUFFER_ORG_ID = '6a4b7b7d1ee432a8454c6455';
const INSIGHTS_SHEET = 'Insights';
const INSIGHTS_HEADER = ['pulled_at', 'sent_at', 'channel', 'post_id', 'text',
  'views', 'reach', 'reactions', 'comments', 'shares', 'saves', 'follows', 'eng_rate', 'clicks'];

async function bufferGql(query, variables = {}) {
  const resp = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BUFFER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await resp.json().catch(() => ({}));
  if (json.errors) throw new Error(json.errors[0]?.message || `Buffer HTTP ${resp.status}`);
  return json.data;
}

// Newest-first sent posts with metrics. 100 covers ~6 weeks at current volume;
// both consumers only look days back, so no pagination needed.
async function bufferSentPosts() {
  const data = await bufferGql(`query($input: PostsInput!) {
    posts(input: $input, first: 100) {
      edges { node { id sentAt channelService text metrics { type value }
        metadata { ... on ThreadsPostMetadata { thread { text } } } } }
    }
  }`, { input: { organizationId: BUFFER_ORG_ID, filter: { status: ['sent'] }, sort: [{ field: 'dueAt', direction: 'desc' }] } });
  return (data?.posts?.edges || []).map((e) => e.node).filter((p) => p.sentAt);
}

// Threads chains publish the whole thread under the root post, so Buffer's
// `comments` metric counts our own chain replies. Subtract them where Buffer
// knows the chain structure (metadata.thread) so the number means real people.
// Before 8 Jul 2026 chains were added manually in the Threads app (invisible to
// Buffer), so those counts are unfixable self-replies — treat as 0.
const THREADS_COMMENTS_RELIABLE_FROM = Date.parse('2026-07-08T00:00:00Z');
function realComments(post) {
  if (post.channelService === 'threads' && Date.parse(post.sentAt) < THREADS_COMMENTS_RELIABLE_FROM) return 0;
  const raw = Number(metricVal(post, 'comments')) || 0;
  const chainLen = post.metadata?.thread?.length || 1;
  return Math.max(0, raw - (chainLen - 1));
}

function metricVal(post, ...types) {
  for (const t of types) {
    const m = (post.metrics || []).find((x) => x.type === t);
    if (m && m.value != null) return m.value;
  }
  return '';
}
function metricSum(post, ...types) {
  const vals = types.map((t) => metricVal(post, t)).filter((v) => v !== '');
  return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : '';
}

async function ensureInsightsTab(sheets) {
  try {
    await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${INSIGHTS_SHEET}!A1` });
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: INSIGHTS_SHEET } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${INSIGHTS_SHEET}!A1`,
      valueInputOption: 'RAW', requestBody: { values: [INSIGHTS_HEADER] },
    });
  }
}

async function collectInsights() {
  if (!BUFFER_TOKEN || !SPREADSHEET_ID) return;
  try {
    const sheets = getSheetsClient();
    await ensureInsightsTab(sheets);
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, range: `${INSIGHTS_SHEET}!B2:B`,
    });
    const logged = (existing.data.values || []).map((r) => Date.parse(r[0])).filter(Boolean);
    const since = logged.length ? Math.max(...logged) : Date.now() - 14 * 86400e3;
    const matured = Date.now() - 7 * 86400e3;
    if (since >= matured) return;
    const pulledAt = new Date().toISOString();
    const rows = (await bufferSentPosts())
      .filter((p) => { const t = Date.parse(p.sentAt); return t > since && t <= matured; })
      .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
      .map((p) => [pulledAt, p.sentAt, p.channelService, p.id,
        String(p.text || '').replace(/\s+/g, ' ').slice(0, 180),
        metricVal(p, 'views', 'impressions'), metricVal(p, 'reach'),
        metricVal(p, 'reactions', 'likes'), realComments(p),
        metricSum(p, 'shares', 'reposts', 'quotes'), metricVal(p, 'saves'),
        metricVal(p, 'follows'), metricVal(p, 'engagementRate'), metricVal(p, 'clicks')]);
    if (!rows.length) return;
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, range: `${INSIGHTS_SHEET}!A1`,
      valueInputOption: 'RAW', requestBody: { values: rows },
    });
    console.log(`Insights: snapshotted ${rows.length} matured post(s)`);
  } catch (err) {
    console.error('collectInsights error:', err.message);
  }
}
setTimeout(collectInsights, 60 * 1000);            // shortly after boot
setInterval(collectInsights, 6 * 3600 * 1000);     // then every 6 hours

app.get('/api/insights', async (req, res) => {
  if (!BUFFER_TOKEN) return res.status(500).json({ error: 'BUFFER_TOKEN is not set on the server' });
  try {
    const since = Date.now() - 30 * 86400e3;
    const [posts, agg] = await Promise.all([
      bufferSentPosts(),
      bufferGql(`query($input: AggregatedPostMetricsInput!) {
        aggregatedPostMetrics(input: $input) { metrics { type name value unit } }
      }`, { input: {
        organizationId: BUFFER_ORG_ID,
        startDateTime: new Date(since).toISOString(),
        endDateTime: new Date().toISOString(),
      } }),
    ]);
    const recent = posts
      .filter((p) => Date.parse(p.sentAt) >= since)
      .map((p) => ({
        sentAt: p.sentAt, channel: p.channelService,
        text: String(p.text || '').replace(/\s+/g, ' ').slice(0, 140),
        views: Number(metricVal(p, 'views', 'impressions')) || 0,
        reactions: Number(metricVal(p, 'reactions', 'likes')) || 0,
        comments: realComments(p),
      }));
    const perChannel = {};
    for (const p of recent) {
      const c = perChannel[p.channel] || (perChannel[p.channel] = { posts: 0, views: 0, reactions: 0, comments: 0 });
      c.posts += 1; c.views += p.views; c.reactions += p.reactions; c.comments += p.comments;
    }
    const byViews = [...recent].sort((a, b) => b.views - a.views);
    res.json({
      days: 30,
      totalPosts: recent.length,
      aggregate: agg?.aggregatedPostMetrics?.metrics || [],
      perChannel,
      top: byViews.slice(0, 5),
      bottom: byViews.filter((p) => Date.parse(p.sentAt) <= Date.now() - 2 * 86400e3).slice(-3).reverse(),
    });
  } catch (err) {
    console.error('GET /api/insights error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─── Serve dashboard ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Auto Social dashboard running on port ${PORT}`));
