// ─── Picture rotation ─────────────────────────────────────────────────────────
// Evergreen posting for every brand. A brand's pool is every finished set under
// visuals/<brand>/<set>/ (manifest.json + NN-slug.jpg, made by visuals/tools/make_posts.py).
// Each day, per channel, the least-recently-posted picture is scheduled in Buffer
// at a fixed UK time with a caption it has not used on that channel before. When a
// picture has used all its captions, a fresh one is written from the brand brief
// and linted against the picture's own facts before it can ever be posted.
//
// State lives in two sheet tabs, so restarts and missed runs self-heal:
//   Rotation     one row per caption version of a picture (status Ready | Hold | Rejected)
//   RotationLog  one row per scheduled post (the log IS the position in the cycle)
//
// Nothing runs unless ROTATION_BRANDS names the brand (comma-separated BRANDS keys).
// Server wiring is at the bottom (mount); everything above it is pure and is also
// used offline by visuals/tools/captions.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VISUALS_DIR = path.join(__dirname, 'visuals');
const ROT = { sheet: 'Rotation', header: ['created_at', 'brand', 'key', 'variant', 'status', 'facts_hash', 'source', 'hook', 'ig_caption', 'tiktok_title', 'tiktok_caption', 'threads_text', 'threads_topic', 'lint'] };
const LOG = { sheet: 'RotationLog', header: ['logged_at', 'brand', 'platform', 'due_at', 'key', 'variant', 'buffer_id', 'error', 'status'] };
const CAPTION_FIELDS = ['hook', 'ig_caption', 'tiktok_title', 'tiktok_caption', 'threads_text', 'threads_topic'];
// UK clock, seven days a week. Threads sits away from the Make auto-poster's slots.
const TIMES = { instagram: '12:00', threads: '18:30', tiktok: '19:00' };
// Channels run the same order a third of a cycle apart, so one picture never
// lands on two of a brand's accounts on the same day.
const OFFSET = { instagram: 0, tiktok: 1, threads: 2 };
const LEAD_MS = 2 * 3600e3;        // schedule at least this far ahead
const MAX_GENERATIONS_PER_TICK = 4;

const liveBrands = () => String(process.env.ROTATION_BRANDS || '').split(',').map((s) => s.trim()).filter(Boolean);

// ── Pool ──
// A caption belongs to the wording of a picture: if the manifest entry changes
// (re-render with new numbers), its hash changes and old captions stop being used.
function entryHash(p) {
  return crypto.createHash('sha1').update(JSON.stringify([p.headline, p.sub, p.shows, p.angle, p.facts])).digest('hex').slice(0, 10);
}

function loadPool(brand) {
  const dir = path.join(VISUALS_DIR, brand.toLowerCase());
  const pool = { brand, dir, posts: [], seeds: {}, rules: '' };
  let sets = [];
  try { sets = fs.readdirSync(dir).filter((s) => fs.existsSync(path.join(dir, s, 'manifest.json'))).sort(); } catch { return pool; }
  for (const set of sets) {
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(dir, set, 'manifest.json'), 'utf8')); } catch (e) { console.warn(`rotation: skipping ${brand}/${set}: ${e.message}`); continue; }
    for (const p of m.posts || []) {
      const file = path.join(dir, set, p.file || '');
      if (!p.id || !/\.jpe?g$/i.test(file) || !fs.existsSync(file)) continue;   // JPG only: TikTok rejects PNG
      pool.posts.push({ key: `${set}/${p.id}`, set, id: p.id, file, entry: p, hash: entryHash(p) });
    }
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, set, 'captions.json'), 'utf8'));
      for (const [id, cap] of Object.entries(c.posts || {})) pool.seeds[`${set}/${id}`] = cap;
    } catch { /* no reviewed captions for this set yet */ }
  }
  try { pool.rules = fs.readFileSync(path.join(dir, 'caption-rules.md'), 'utf8'); } catch { /* optional */ }
  return pool;
}

// Manifest order groups related pictures together; a stride walks the list so
// neighbours in the cycle are far apart in the manifest.
function strideOrder(n) {
  if (n < 3) return [...Array(n).keys()];
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let k = Math.max(2, Math.round(n * 0.38));
  while (gcd(k, n) !== 1) k++;
  return [...Array(n).keys()].map((i) => (i * k) % n);
}

// ── Lint ──
// The guard between a generated caption and a public post. A caption may only
// carry digits that appear in its picture's manifest entry (or the brand's
// allowed list, e.g. plan prices). Same lesson as the Threads auto-poster: a
// prompt rule alone never stopped a bad generation, a check before posting does.
const ruleList = (rules, label) => ((new RegExp(`^${label}:(.*)$`, 'mi').exec(rules || '') || [])[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
const numbersIn = (s) => (String(s).replace(/#\w+/g, ' ').replace(/(\d),(?=\d{3})/g, '$1').match(/(?<![A-Za-z\d.])\d+(?:\.\d+)?/g) || []).map(Number);
const GENERIC_BANNED = [/guarantee/i, /risk-free/i, /\bsignals?\b/i, /—/, /\b(today|tonight|this week|this month|just launched|now live|brand new)\b/i,
  /^most (retail )?(traders|people)\b/i, /^i used to\b/i, /^here'?s (why|what|the)\b/i, /\b(dummy|placeholder|TBD|lorem)\b/i];

function lintCaption(c, post, rules = '', { maxTags = 5 } = {}) {
  const out = [];
  const e = post.entry;
  const ok = new Set([...numbersIn([e.headline, e.sub, e.shows, e.cta, ...(e.facts || [])].join(' | ')), ...ruleList(rules, 'ALLOWED NUMBERS').map(Number)]);
  const banned = ruleList(rules, 'BANNED WORDS').map((w) => new RegExp(`(?<![-\\w])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  const allowed = ruleList(rules, 'ALLOWED PHRASES');
  const parts = { instagram: c.ig_caption, tiktok: `${c.tiktok_title}\n${c.tiktok_caption}`, threads: c.threads_text };
  for (const [k, raw] of Object.entries(parts)) {
    const v = String(raw || '');
    if (v.trim().length < 40) { out.push(`${k}: empty or too short`); continue; }
    const bad = [...new Set(numbersIn(v).filter((n) => !ok.has(n)))];
    if (bad.length) out.push(`${k}: numbers not in the picture's facts: ${bad.join(', ')}`);
    let scrub = v;
    for (const a of allowed) scrub = scrub.split(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).join(' ');
    for (const re of [...GENERIC_BANNED, ...banned]) if (re.test(scrub)) out.push(`${k}: banned wording ${re.source}`);
    if ((v.match(/!/g) || []).length > 1) out.push(`${k}: more than one exclamation mark`);
  }
  const ig = String(c.ig_caption || '');
  const tags = ig.match(/#\w+/g) || [];
  if (tags.length < 3 || tags.length > maxTags) out.push(`instagram: ${tags.length} hashtags (want 3-${maxTags})`);
  const words = ig.replace(/#\w+/g, '').split(/\s+/).filter(Boolean).length;
  if (words < 60 || words > 240) out.push(`instagram: ${words} words`);
  if (!c.tiktok_title || c.tiktok_title.length > 90) out.push(`tiktok: title ${String(c.tiktok_title || '').length} chars`);
  if (String(c.threads_text || '').length > 480) out.push(`threads: ${c.threads_text.length} chars (500 fails to publish)`);
  if (/#/.test(c.threads_text || '')) out.push('threads: contains a hashtag');
  if (!c.threads_topic || /strategydynamics|marketdynamics|sealed/i.test(c.threads_topic)) out.push('threads: topic missing or a brand name');
  return out;
}

// ── Prompt ──
function buildPrompt({ label, post, rules, variant, threadsShort, ownHooks = [], otherHooks = [], recentTopics = [], lastLint = '' }) {
  const p = post.entry;
  return [
    `Write the social captions for ONE ${label} picture post.`,
    `The picture is a FINISHED designed post from an evergreen set that repeats on a cycle. It already carries the headline "${p.headline}", the line "${p.sub}", a "${p.cta}" button and the web address. The caption adds the why, the mechanics and what the reader gets. It never just repeats those words.`,
    `BRAND: ${label}. Write as this brand, with this brand's links and CTAs.`,
    p.pillar ? `CONTENT PILLAR: ${p.pillar}` : '',
    `FEATURE: ${p.feature}`,
    `WHAT IS ON SCREEN: ${p.shows}`,
    `ANGLE: ${p.angle}`,
    `FACTS: ${(p.facts || []).join(' | ')}`,
    'RULES:',
    `- NUMBERS: the only figures you may write as digits are the ones in FACTS, in the headline and line quoted above${ruleList(rules, 'ALLOWED NUMBERS').length ? `, and these: ${ruleList(rules, 'ALLOWED NUMBERS').join(', ')}` : ''}. Anything else is left out or said in words without a figure. A caption with any other digit is thrown away automatically.`,
    '- EVERGREEN: no "today", "this week", "new", "just launched", "now live", dates or anything that goes stale.',
    '- No em dashes. At most one exclamation mark. No invented anecdotes, customers, results or founder stories: only what the brief states.',
    '- Instagram: 100-180 words, hook on line 1, exactly 5 hashtags chosen by the brief\'s rules. TikTok: title up to 90 characters, caption 120-300 characters.',
    threadsShort
      ? '- Threads: a short conversation-starter, 80-180 characters in total: one narrow idea, then a genuine open question the reader can answer from their own experience in one line. No CTA, no link.'
      : '- Threads: 250-400 characters, ending with exactly one CTA.',
    rules ? `BRAND RULES FOR THESE PICTURES:\n${rules.trim()}` : '',
    variant > 1 ? `This is caption version ${variant} for this picture. Take a clearly different angle from the earlier versions, which opened: ${ownHooks.map((h) => `"${h}"`).join(' / ')}` : '',
    otherHooks.length ? `Opening lines already used by other pictures (use a different sentence shape, not just different words): ${otherHooks.map((h) => `"${h}"`).join(' / ')}` : '',
    recentTopics.length ? `Threads topics used by the last few pictures: ${recentTopics.join(', ')}. Pick a different one from the brief's approved pool that genuinely fits this picture.` : '',
    lastLint ? `The previous attempt was thrown away for: ${lastLint}. Do not repeat that.` : '',
    'Apply the brief\'s image handling rules: the picture is authoritative and nothing that is not visible is invented. Return the JSON only.',
  ].filter(Boolean).join('\n');
}

// ── Time ── (Buffer wants an absolute instant; slots are quoted in UK clock)
const londonParts = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
const londonDate = (d) => { const p = londonParts(d); return `${p.year}-${p.month}-${p.day}`; };
function londonToUtc(date, hhmm) {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const p = londonParts(new Date(guess));
  const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return new Date(guess - (wall - guess));
}
// The next slot at least LEAD_MS away: today's if there is still time, else tomorrow's.
function nextSlot(hhmm, now = new Date()) {
  for (let d = 0; d < 3; d++) {
    const date = londonDate(new Date(now.getTime() + d * 86400e3));
    const dueAt = londonToUtc(date, hhmm);
    if (dueAt - now >= LEAD_MS) return { date, dueAt };
  }
  return null;
}

// ── Choosing ──
const firstLine = (s) => String(s || '').split('\n')[0].trim();
const validVariants = (rows, brand, post) => rows
  .filter((r) => r.brand === brand && r.key === post.key && r.status === 'Ready' && r.facts_hash === post.hash)
  .sort((a, b) => a.variant - b.variant);
const usesOf = (log, brand, platform) => log.filter((l) => l.brand === brand && l.platform === platform && !l.error);

// Least-recently-posted picture on this channel (never-posted first, in stride
// order), with the lowest caption version it has not used here yet.
function pickNext(pool, rows, log, platform) {
  const n = pool.posts.length;
  const off = Math.round((n * (OFFSET[platform] || 0)) / 3);
  const rank = new Map(strideOrder(n).map((pi, i) => [pool.posts[pi].key, (i - off + n) % n]));
  const uses = usesOf(log, pool.brand, platform);
  const lastDue = (key) => uses.filter((u) => u.key === key).reduce((m, u) => Math.max(m, Date.parse(u.due_at) || 0), 0);
  const cands = pool.posts.map((p) => ({ post: p, vars: validVariants(rows, pool.brand, p), last: lastDue(p.key) })).filter((c) => c.vars.length);
  if (!cands.length) return null;
  cands.sort((a, b) => a.last - b.last || rank.get(a.post.key) - rank.get(b.post.key));
  const { post, vars } = cands[0];
  const mine = uses.filter((u) => u.key === post.key);
  const lastUsed = (v) => mine.filter((u) => Number(u.variant) === v.variant).reduce((m, u) => Math.max(m, Date.parse(u.due_at) || 0), 0);
  const caption = vars.find((v) => !lastUsed(v)) || [...vars].sort((a, b) => lastUsed(a) - lastUsed(b))[0];
  return { post, caption };
}

// A picture needs a new caption when some connected channel has used every one it has.
function needsCaption(pool, rows, log, platforms, post) {
  const vars = validVariants(rows, pool.brand, post);
  if (!vars.length) return true;
  return platforms.some((pf) => {
    const used = new Set(usesOf(log, pool.brand, pf).filter((u) => u.key === post.key).map((u) => Number(u.variant)));
    return vars.every((v) => used.has(v.variant));
  });
}

// ── Server wiring ──
// d = { app, getSheets, SPREADSHEET_ID, ensureTab, BRANDS, PLATFORMS, bufferCreatePost,
//       generate(brand, userText, imageFile) → caption fields, publicBase, IMG_CACHE_DIR,
//       bufferPostStatus(id) → { status, error }, alert(text) }
function mount(d) {
  const colLetter = (i) => String.fromCharCode(65 + i);
  // A dry run never creates the tabs: a missing tab just reads as empty.
  async function readTab(sheets, tab, create) {
    if (create) await d.ensureTab(sheets, tab);
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: d.SPREADSHEET_ID, range: `${tab.sheet}!A2:${colLetter(tab.header.length - 1)}` })
      .catch((e) => { if (create) throw e; return { data: {} }; });
    return (r.data.values || []).map((row, i) => {
      const o = { _row: i + 2 };
      tab.header.forEach((k, c) => { o[k] = row[c] || ''; });
      if (o.variant !== undefined) o.variant = Number(o.variant) || 0;
      return o;
    });
  }
  async function append(sheets, tab, obj) {
    const r = await sheets.spreadsheets.values.append({
      spreadsheetId: d.SPREADSHEET_ID, range: `${tab.sheet}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [tab.header.map((k) => String(obj[k] ?? ''))] },
    });
    return parseInt((/!A(\d+)/.exec(r.data.updates?.updatedRange || '') || [])[1], 10) || null;
  }
  // Many rows in ONE write. Seeding a brand row by row (35 to 40 appends) blew the
  // Sheets quota of 60 writes a minute on the first live run, 13 Nov 2026.
  async function appendMany(sheets, tab, objs) {
    if (!objs.length) return;
    const r = await sheets.spreadsheets.values.append({
      spreadsheetId: d.SPREADSHEET_ID, range: `${tab.sheet}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: objs.map((o) => tab.header.map((k) => String(o[k] ?? ''))) },
    });
    const first = parseInt((/!A(\d+)/.exec(r.data.updates?.updatedRange || '') || [])[1], 10) || null;
    objs.forEach((o, i) => { o._row = first ? first + i : null; });
  }
  const setCells = (sheets, tab, row, obj) => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: d.SPREADSHEET_ID,
    requestBody: { valueInputOption: 'RAW', data: Object.entries(obj).map(([k, v]) => ({ range: `${tab.sheet}!${colLetter(tab.header.indexOf(k))}${row}`, values: [[String(v)]] })) },
  });

  // Content-addressed public URL for a picture (same cache the composers use).
  function imageUrl(file) {
    const buf = fs.readFileSync(file);
    const name = `${crypto.createHash('sha1').update(buf).digest('hex')}.jpg`;
    const dest = path.join(d.IMG_CACHE_DIR, name);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
    return `${d.publicBase()}/images/cache/${name}`;
  }

  const channelsOf = (brand) => d.PLATFORMS.filter((pf) => d.BRANDS[brand].channels[pf]);
  const nextVariant = (rows, brand, key) => rows.filter((r) => r.brand === brand && r.key === key).reduce((m, r) => Math.max(m, r.variant), 0) + 1;

  async function writeCaption(brand, pool, rows, post, variant, extraHooks = [], extraTopics = []) {
    const idx = pool.posts.indexOf(post);
    const own = rows.filter((r) => r.brand === brand && r.key === post.key);
    const lastRejected = own.filter((r) => r.status === 'Rejected' && r.facts_hash === post.hash).pop();
    const others = pool.posts.filter((p) => p !== post).map((p) => validVariants(rows, brand, p).pop()).filter(Boolean);
    const otherHooks = others.map((r) => firstLine(r.ig_caption)).concat(extraHooks).slice(-30);
    const recentTopics = [...others].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((r) => r.threads_topic).concat(extraTopics).filter(Boolean).slice(-4);
    const userText = buildPrompt({
      label: d.BRANDS[brand].label, post, rules: pool.rules, variant, threadsShort: (idx + variant) % 2 === 1,
      ownHooks: own.filter((r) => r.status === 'Ready').map((r) => firstLine(r.ig_caption)), otherHooks, recentTopics, lastLint: lastRejected?.lint || '',
    });
    const cap = await d.generate(brand, userText, post.file);
    return { cap, lint: lintCaption(cap, post, pool.rules) };
  }

  // Alerts go to the private error channel (ALERT_WEBHOOK_URL). The same message
  // is sent at most once every 12 hours, so a stuck problem doesn't flood it.
  const alerted = new Map();
  function alert(key, text) {
    if (Date.now() - (alerted.get(key) || 0) < 12 * 3600e3) return;
    alerted.set(key, Date.now());
    Promise.resolve(d.alert?.(`Picture rotation: ${text}`)).catch(() => {});
  }

  // Buffer accepting a post is not the post going out: the network can still
  // refuse it at publish time. Once a slot is past due, ask Buffer what happened
  // and record it in `status` (sent | failed: … | late), alerting on anything but sent.
  async function checkPublished(sheets, log, now) {
    const due = log.filter((l) => l.buffer_id && l.buffer_id !== 'ok' && !l.error && !l.status && now - Date.parse(l.due_at) > 30 * 60e3).slice(0, 20);
    for (const l of due) {
      const r = await d.bufferPostStatus(l.buffer_id).catch((e) => ({ status: '', error: e.message }));
      const overdueH = (now - Date.parse(l.due_at)) / 3600e3;
      let status = '';
      if (r.status === 'sent') status = 'sent';
      else if (r.status === 'error') status = `failed: ${r.error || 'Buffer could not publish it'}`.slice(0, 300);
      else if (overdueH > 3) status = `late: Buffer says ${r.status || r.error || 'unknown'}`.slice(0, 300);
      if (!status) continue;
      l.status = status;
      await setCells(sheets, LOG, l._row, { status });
      if (status !== 'sent') alert(`pub:${l.buffer_id}`, `${l.brand} ${l.platform} post ${l.key} due ${l.due_at} did not publish. ${status}`);
    }
  }

  let running = false;
  async function tick({ dry = false } = {}) {
    if (running) return { skipped: 'already running' };
    running = true;
    const report = {};
    try {
      const sheets = d.getSheets();
      const rows = await readTab(sheets, ROT, !dry);
      const log = await readTab(sheets, LOG, !dry);
      const now = new Date();
      if (!dry && d.bufferPostStatus) await checkPublished(sheets, log, now).catch((e) => console.error('rotation publish check:', e.message));
      for (const brand of Object.keys(d.BRANDS)) {
        const pool = loadPool(brand);
        if (!pool.posts.length) continue;
        const live = liveBrands().includes(brand);
        const platforms = channelsOf(brand);
        const rep = report[brand] = { live, pictures: pool.posts.length, seeded: 0, written: 0, rejected: 0, scheduled: {} };

        // 1. Import human-reviewed captions (captions.json beside the manifest).
        const seeded = [];
        for (const post of pool.posts) {
          const seed = pool.seeds[post.key];
          if (!seed || seed.hash !== post.hash) continue;
          if (rows.some((r) => r.brand === brand && r.key === post.key && r.facts_hash === post.hash && r.source === 'reviewed')) continue;
          const row = { created_at: now.toISOString(), brand, key: post.key, variant: nextVariant(rows, brand, post.key), status: 'Ready', facts_hash: post.hash, source: 'reviewed', lint: '' };
          for (const k of CAPTION_FIELDS) row[k] = seed[k] || '';
          seeded.push(row);
          rows.push(row); rep.seeded++;
        }
        if (!dry) await appendMany(sheets, ROT, seeded);
        if (!live && !dry) continue;   // a dry run previews every brand

        // 2. Write the captions the next cycle will need, a few per run.
        let budget = dry ? 0 : MAX_GENERATIONS_PER_TICK;
        for (const post of pool.posts) {
          if (budget <= 0) break;
          if (!needsCaption(pool, rows, log, platforms, post)) continue;
          const recentRejects = rows.filter((r) => r.brand === brand && r.key === post.key && r.facts_hash === post.hash && r.status === 'Rejected' && now - Date.parse(r.created_at) < 7 * 86400e3);
          if (recentRejects.length >= 2) continue;   // stop burning calls; existing captions keep cycling
          budget--;
          try {
            const variant = nextVariant(rows, brand, post.key);
            const { cap, lint } = await writeCaption(brand, pool, rows, post, variant);
            const row = { created_at: new Date().toISOString(), brand, key: post.key, variant, status: lint.length ? 'Rejected' : 'Ready', facts_hash: post.hash, source: 'generated', lint: lint.join('; ') };
            for (const k of CAPTION_FIELDS) row[k] = cap[k] || '';
            row._row = await append(sheets, ROT, row);
            rows.push(row);
            if (lint.length) { rep.rejected++; console.warn(`rotation: ${brand} ${post.key} v${variant} rejected: ${row.lint}`); } else rep.written++;
          } catch (e) { console.error(`rotation: caption for ${brand} ${post.key} failed:`, e.message); }
        }

        // 3. Schedule the next slot on each channel.
        for (const pf of platforms) {
          const slot = nextSlot(TIMES[pf], now);
          if (!slot) continue;
          const sameDay = log.filter((l) => l.brand === brand && l.platform === pf && londonDate(new Date(l.due_at)) === slot.date);
          if (sameDay.some((l) => !l.error) || sameDay.length >= 3) continue;
          const pick = pickNext(pool, rows, log, pf);
          if (!pick) { rep.scheduled[pf] = 'no picture with a ready caption'; if (!dry) alert(`nopick:${brand}:${pf}`, `${brand} ${pf} has no picture with a usable caption, so nothing was scheduled for ${slot.date}.`); continue; }
          const { post, caption } = pick;
          const entry = { logged_at: new Date().toISOString(), brand, platform: pf, due_at: slot.dueAt.toISOString(), key: post.key, variant: caption.variant, buffer_id: '', error: '' };
          rep.scheduled[pf] = { due: entry.due_at, key: post.key, variant: caption.variant };
          if (dry) continue;
          // Log first: if we die between here and Buffer's reply, the slot is
          // skipped rather than posted twice.
          const logRow = await append(sheets, LOG, entry);
          entry._row = logRow;
          log.push(entry);
          const B = d.BRANDS[brand];
          const r = await d.bufferCreatePost({
            channelId: B.channels[pf], platform: pf, dueAt: entry.due_at, imageUrls: [imageUrl(post.file)],
            text: { instagram: caption.ig_caption, tiktok: caption.tiktok_caption, threads: caption.threads_text }[pf],
            threadsTopic: pf === 'threads' ? (caption.threads_topic || undefined) : undefined,
            link: pf === 'instagram' ? B.link : undefined,
            tiktokTitle: caption.tiktok_title || caption.hook,
          }).catch((e) => ({ ok: false, error: e.message }));
          Object.assign(entry, r.ok ? { buffer_id: r.id || 'ok' } : { error: r.error || 'failed' });
          rep.scheduled[pf].result = r.ok ? 'scheduled' : entry.error;
          if (logRow) await setCells(sheets, LOG, logRow, { buffer_id: entry.buffer_id, error: entry.error });
          if (!r.ok) {
            console.error(`rotation: ${brand} ${pf} ${post.key}: ${entry.error}`);
            const tries = sameDay.length + 1;
            alert(`sched:${brand}:${pf}:${slot.date}:${tries}`, `Buffer refused the ${brand} ${pf} post ${post.key} for ${slot.date} (attempt ${tries} of 3${tries < 3 ? ', retrying next hour' : ', giving up for that day'}). ${entry.error}`);
          }
        }
      }
    } catch (e) {
      console.error('rotation tick error:', e.message);
      report.error = e.message;
      if (!dry) alert(`tick:${e.message}`, `the hourly run failed, so nothing was scheduled this hour. ${e.message}`);
    } finally { running = false; }
    return report;
  }

  // GET /api/rotation — what is live, what each channel posts next, the recent log.
  d.app.get('/api/rotation', async (req, res) => {
    try {
      const plan = await tick({ dry: true });
      const log = await readTab(d.getSheets(), LOG);
      res.json({ live: liveBrands(), times_uk: TIMES, plan, recent: log.slice(-15).reverse() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // POST /api/rotation/tick — run one pass now (same as the hourly job; respects ROTATION_BRANDS).
  d.app.post('/api/rotation/tick', async (req, res) => res.json(await tick({ dry: !!req.body?.dry })));
  // POST /api/rotation/caption — body { brand, key, variant?, avoid?: [opening lines], topics?: [recent Threads topics] }. Writes one caption and lints it. Saves nothing.
  d.app.post('/api/rotation/caption', async (req, res) => {
    try {
      const brand = Object.keys(d.BRANDS).find((b) => b.toLowerCase() === String(req.body?.brand || '').toLowerCase());
      const pool = brand ? loadPool(brand) : null;
      const post = pool?.posts.find((p) => p.key === req.body?.key);
      if (!post) return res.status(404).json({ error: 'no such brand/picture' });
      const avoid = (Array.isArray(req.body?.avoid) ? req.body.avoid : []).map(String);
      const { cap, lint } = await writeCaption(brand, pool, [], post, Number(req.body?.variant) || 1, avoid, (Array.isArray(req.body?.topics) ? req.body.topics : []).map(String));
      res.json({ ok: true, hash: post.hash, lint, ...Object.fromEntries(CAPTION_FIELDS.map((k) => [k, cap[k] || ''])) });
    } catch (e) { res.status(e.status || 502).json({ error: e.message }); }
  });

  if (liveBrands().length) {
    setTimeout(tick, 2 * 60 * 1000);
    setInterval(tick, 60 * 60 * 1000);
    console.log(`Rotation live for: ${liveBrands().join(', ')}`);
  }
  return { tick };
}

module.exports = { mount, loadPool, entryHash, strideOrder, lintCaption, buildPrompt, pickNext, needsCaption, nextSlot, londonToUtc, validVariants, TIMES, CAPTION_FIELDS };
