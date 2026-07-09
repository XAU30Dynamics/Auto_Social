require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  if (req.method === 'GET' && /^\/graphic\/\d+\.png$/.test(req.path)) return next();
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

// Render a full 1080×1350 HTML document to a PNG Buffer. Puppeteer v24 returns a
// Uint8Array, so callers get a Node Buffer (res.send would JSON-serialize a raw
// Uint8Array into {"0":137,...}).
async function renderHtmlToPng(html) {
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
    return Buffer.from(png);
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
app.get('/api/graphic/:row.png', async (req, res) => {
  const row = parseInt(req.params.row, 10);
  if (!row || row < 2) return res.status(400).send('bad row');
  try {
    const colU = String.fromCharCode(65 + COL.graphic_html); // 'U'
    const html = String(await readCell(`${colU}${row}`)).trim();
    if (!html) return res.status(404).send('no graphic on this post');
    const png = await renderHtmlToPng(html);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=600'); // let Buffer fetch it
    res.send(png);
  } catch (err) {
    console.error('GET /api/graphic/:row.png error:', err.message);
    res.status(502).send('render failed');
  }
});

// ─── POST /api/buffer/send/:row ───────────────────────────────────────────────
// Sends a reviewed post to Buffer. Body: { channels?: ['instagram','x','threads'],
// mode?: 'now'|'queue' }. Routes Instagram by brand (SD vs MD profile); X and
// Threads each have one channel that takes any brand. The graphic is attached as
// an image URL Buffer fetches (GET /api/graphic/:row.png).
const BUFFER_TOKEN = process.env.BUFFER_TOKEN;
const BUFFER_CHANNELS = {
  threads: '6a4b8557404834462875a0b7', // strategy_dynamics (Threads)
  x: '6a4bb6e7404834462876920b',       // stratdynamics (X)
  ig_sd: '6a4bbf26404834462876b88b',   // strategy_dynamics (Instagram)
  ig_md: '6a4bc28f404834462876c3a5',   // marketdynamics_app (Instagram)
};

async function bufferCreatePost({ channelId, text, imageUrl, mode, platform, thread, threadsTopic }) {
  const input = {
    channelId,
    schedulingType: 'automatic',
    mode: mode === 'now' ? 'shareNow' : 'addToQueue',
    text: text || '',
    assets: imageUrl ? [{ image: { url: imageUrl } }] : [],
  };
  // Instagram requires post metadata (type + shouldShareToFeed); X/Threads don't.
  if (platform === 'instagram') {
    input.metadata = { instagram: { type: 'post', shouldShareToFeed: true } };
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
  const query = 'mutation($input:CreatePostInput!){createPost(input:$input){__typename ... on PostActionSuccess{post{id}} ... on RestProxyError{message code} ... on UnexpectedError{message} ... on NotFoundError{message} ... on UnauthorizedError{message} ... on LimitReachedError{message}}}';
  const resp = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BUFFER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { input } }),
  });
  const json = await resp.json().catch(() => ({}));
  const cp = json?.data?.createPost;
  if (cp?.__typename === 'PostActionSuccess') return { ok: true, id: cp.post?.id };
  const error = cp?.message || json?.errors?.[0]?.message || `HTTP ${resp.status}`;
  return { ok: false, error };
}

app.post('/api/buffer/send/:row', async (req, res) => {
  if (!BUFFER_TOKEN) return res.status(500).json({ error: 'BUFFER_TOKEN is not set on the server' });
  const row = parseInt(req.params.row, 10);
  if (!row || row < 2) return res.status(400).json({ error: 'bad row' });
  const wanted = Array.isArray(req.body?.channels) && req.body.channels.length
    ? req.body.channels : ['instagram', 'x', 'threads'];
  const mode = req.body?.mode === 'now' ? 'now' : 'queue';

  try {
    const sheets = getSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${row}:V${row}`,
    });
    const r = (resp.data.values || [])[0] || [];
    const graphicHtml = String(r[COL.graphic_html] || '').trim();
    if (!graphicHtml) return res.status(400).json({ error: 'This post has no graphic to send' });

    const isMD = String(r[COL.brand] || '').toLowerCase().includes('market');
    const caption = r[COL.caption] || '';
    const hashtags = r[COL.hashtags] || '';
    // Idempotent: the caption column may already contain the hashtags (saved from
    // the merged dashboard field), so only append them if they're not already there.
    const igText = (hashtags && !caption.includes(hashtags)) ? `${caption}\n\n${hashtags}` : caption;
    const xText = r[COL.x_post] || '';
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

    const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${base}/api/graphic/${row}.png`;

    const plan = [];
    if (wanted.includes('instagram')) plan.push(['instagram', isMD ? BUFFER_CHANNELS.ig_md : BUFFER_CHANNELS.ig_sd, igText]);
    if (wanted.includes('x')) plan.push(['x', BUFFER_CHANNELS.x, xText]);
    if (wanted.includes('threads')) plan.push(['threads', BUFFER_CHANNELS.threads, threadsText]);

    const results = {};
    // Sequential so Buffer fetches the image URL one at a time (kinder on render).
    for (const [name, channelId, text] of plan) {
      results[name] = await bufferCreatePost({
        channelId, text, imageUrl, mode, platform: name,
        threadsTopic: name === 'threads' ? threadsTopic : undefined,
      });
    }
    res.json({ ok: true, brand: isMD ? 'MarketDynamics' : 'StrategyDynamics', mode, results });
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
      channelId: BUFFER_CHANNELS.threads,
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
      edges { node { id sentAt channelService text metrics { type value } } }
    }
  }`, { input: { organizationId: BUFFER_ORG_ID, filter: { status: ['sent'] }, sort: [{ field: 'dueAt', direction: 'desc' }] } });
  return (data?.posts?.edges || []).map((e) => e.node).filter((p) => p.sentAt);
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
        metricVal(p, 'reactions', 'likes'), metricVal(p, 'comments'),
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
        comments: Number(metricVal(p, 'comments')) || 0,
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
