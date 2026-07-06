require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
};

// ─── GET /api/posts ───────────────────────────────────────────────────────────
app.get('/api/posts', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:U`,
    });

    const rows = response.data.values || [];
    const posts = rows.map((row, index) => {
      const caption = row[COL.caption] || '';
      const hashtags = row[COL.hashtags] || '';
      // Merge caption + hashtags for the dashboard — single block, ready to copy
      const captionWithHashtags = hashtags
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

    res.json({ ok: true });
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

app.post('/api/graphic/render', async (req, res) => {
  const html = String(req.body?.html || '').trim();
  if (!html) return res.status(400).json({ error: 'html is required' });

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    // deviceScaleFactor 1 → the PNG is exactly 1080×1350 (Instagram portrait).
    await page.setViewport({ width: GRAPHIC_W, height: GRAPHIC_H, deviceScaleFactor: 1 });
    // domcontentloaded (not networkidle0): a single stalled font/image request
    // must never hang the render. We then explicitly wait for fonts + images
    // with hard caps so text/images are painted before the screenshot.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
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
      type: 'png',
      clip: { x: 0, y: 0, width: GRAPHIC_W, height: GRAPHIC_H },
    });
    // Puppeteer v24 returns a Uint8Array; wrap in Buffer or res.send() will
    // JSON-serialize it into {"0":137,...} instead of sending raw PNG bytes.
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(png));
  } catch (err) {
    console.error('POST /api/graphic/render error:', err.message);
    res.status(502).json({ error: 'Render failed', detail: err.message });
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
});

// ─── GET /api/threadlog ───────────────────────────────────────────────────────
// Recent auto-posted threads for the dashboard's "Auto Threads" panel.
// Reads the `ThreadLog` tab (A ts YYYYMMDD-HHmmss, B pillar, C topic, D hook,
// E total_posts, F root_post_id) and returns the last ~2 days, newest first.
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
    const cutoff = Date.now() - 2 * 86400 * 1000;
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

// ─── Serve dashboard ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Auto Social dashboard running on port ${PORT}`));
