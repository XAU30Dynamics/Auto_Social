#!/usr/bin/env node
// Reviewed captions for a brand's picture sets (visuals/<brand>/<set>/captions.json).
// These are the first caption each picture posts with; the rotation job (rotation.js)
// imports them and writes later versions itself. NOTHING here talks to Buffer or the sheet.
//
//   node visuals/tools/captions.js generate <Brand> [set/id …]   # write missing or out-of-date captions
//   node visuals/tools/captions.js check    <Brand>              # lint every caption against its picture's facts
//
// <Brand> is a BRANDS key: StrategyDynamics | MarketDynamics | Sealed.
// generate needs a running Auto Social server (BASE, default http://localhost:3111);
// see CLAUDE.md "Local dev with the real env". check runs offline.
const fs = require('fs');
const path = require('path');
const R = require('../../rotation');

const [cmd, brand, ...only] = process.argv.slice(2);
if (!cmd || !brand) { console.error('usage: captions.js generate|check <Brand> [set/id …]'); process.exit(1); }
const BASE = (process.env.BASE || 'http://localhost:3111').replace(/\/$/, '');
const pool = R.loadPool(brand);
if (!pool.posts.length) { console.error(`no finished sets under visuals/${brand.toLowerCase()}/`); process.exit(1); }

const fileOf = (set) => path.join(pool.dir, set, 'captions.json');
const files = {};
const capsOf = (set) => files[set] || (files[set] = fs.existsSync(fileOf(set)) ? JSON.parse(fs.readFileSync(fileOf(set), 'utf8')) : { brand, posts: {} });
const saved = (p) => capsOf(p.set).posts[p.id];
const fresh = (p) => saved(p) && saved(p).hash === p.hash;
const firstLine = (s) => String(s || '').split('\n')[0].trim();

async function generate() {
  for (const p of pool.posts) {
    if (only.length ? !only.includes(p.key) : fresh(p)) continue;
    const done = pool.posts.filter((q) => q !== p && fresh(q));
    const avoid = done.map((q) => firstLine(saved(q).ig_caption));
    const topics = done.map((q) => saved(q).threads_topic).slice(-4);
    const r = await fetch(`${BASE}/api/rotation/caption`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand, key: p.key, avoid, topics }) });
    const g = await r.json().catch(() => ({ error: `non-JSON reply (HTTP ${r.status})` }));
    if (!r.ok) throw new Error(`${p.key}: ${g.error}`);
    const { ok, lint, ...cap } = g;
    capsOf(p.set).posts[p.id] = { file: p.entry.file, ...cap };
    fs.writeFileSync(fileOf(p.set), JSON.stringify(capsOf(p.set), null, 1) + '\n');
    console.log(`${p.key}  "${cap.hook}"${lint.length ? `\n   CHECK: ${lint.join('; ')}` : ''}`);
  }
}

function check() {
  let bad = 0;
  for (const p of pool.posts) {
    const c = saved(p);
    const issues = !c ? ['no caption yet'] : !fresh(p) ? ['picture changed since this caption was written (will not be used)'] : R.lintCaption(c, p, pool.rules);
    for (const m of issues) { bad++; console.log(`${p.key}: ${m}`); }
  }
  console.log(bad ? `\n${bad} thing(s) to look at across ${pool.posts.length} pictures` : `all clear (${pool.posts.length} pictures)`);
}

({ generate, check: async () => check() }[cmd] || (async () => { throw new Error(`unknown command ${cmd}`); }))()
  .catch((e) => { console.error(e.message); process.exit(1); });
