// Gallery data on the 2.0.1 pattern code: per kind, the most recent examples that reached target before stop
// (H4 first, else H1), plus one recent Possible example per kind.
import { loadBars, type Bar } from "../src/lib/ta-bars";
import { zigzag, type Swing } from "../src/lib/technicals";
import { candidates, triggered, provisional, NAMES, type Pattern, type PatternKind } from "../src/lib/patterns";
const PER = 2;
function atrSeries(bars: Bar[], n = 14): number[] {
  const out: number[] = new Array(bars.length).fill(0);
  let sum = 0; const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]!, pc = bars[i - 1]!.close;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
    trs.push(tr); sum += tr; if (trs.length > n) sum -= trs.shift()!;
    out[i] = sum / trs.length;
  }
  return out;
}
type Ex = { p: Pattern; j: number; status: "confirmed" | "possible"; hit?: number };
function won(bars: Bar[], p: Pattern, j: number): number | null {
  for (let i = j + 1; i <= Math.min(bars.length - 1, j + 24); i++) {
    const b = bars[i]!;
    const hitT = p.dir === "up" ? b.high >= p.target : b.low <= p.target;
    const hitS = p.dir === "up" ? b.low <= p.stop : b.high >= p.stop;
    if (hitS) return null; if (hitT) return i - j;
  }
  return null;
}
function examples(bars: Bar[], k: number) {
  const atr = atrSeries(bars);
  const sw = zigzag(bars, k, atr);
  const wins = new Map<PatternKind, Ex[]>(), poss = new Map<PatternKind, Ex>();
  const known: Swing[] = []; let ptr = 0; let pending: Pattern[] = []; const seen = new Set<string>();
  for (let i = 50; i < bars.length - 1; i++) {
    let fresh = false;
    while (ptr < sw.length && sw[ptr]!.confirmedAt <= i) { known.push(sw[ptr]!); ptr++; fresh = true; }
    if (fresh) for (const p of candidates(known, atr[i]!, bars)) { const key = `${p.kind}:${p.lastSwingI}`; if (!seen.has(key)) { seen.add(key); pending.push(p); } }
    pending = pending.filter((p) => {
      if (triggered(p, bars, i)) {
        const h = i + 25 < bars.length ? won(bars, p, i) : null;
        if (h != null) { const l = wins.get(p.kind) ?? []; l.push({ p, j: i, status: "confirmed", hit: h }); wins.set(p.kind, l.slice(-PER)); }
        return false;
      }
      return i - p.lastSwingI <= p.window;
    });
    if (i % 3 === 0 && known.length > 4 && i > bars.length * 0.5) {
      const prov = provisional(bars, known, i, k, atr[i]!);
      if (prov) for (const p of candidates([...known, prov], atr[i]!, bars)) { if (p.lastSwingI === prov.i) poss.set(p.kind, { p, j: i, status: "possible" }); }
    }
  }
  return { wins, poss };
}
const out: unknown[] = [];
const h4 = await loadBars("H4"), h1 = await loadBars("H1");
const A = examples(h4, 2.0), B = examples(h1, 2.0);
const push = (kind: PatternKind, tf: string, bars: Bar[], { p, j, status, hit }: Ex) => {
  const first = Math.max(0, Math.min(...p.points.map((x) => x.i), ...p.lines.map((l) => l.i1)) - 8);
  const last = Math.min(bars.length - 1, status === "possible" ? j : j + 24);
  const slice = bars.slice(first, last + 1);
  const dur = Date.parse(bars[1]!.timestamp) - Date.parse(bars[0]!.timestamp);
  const t = (i: number) => i < bars.length ? bars[i]!.timestamp : new Date(Date.parse(bars.at(-1)!.timestamp) + (i - bars.length + 1) * dur).toISOString();
  out.push({
    name: NAMES[kind], tf, dir: p.dir, at: t(j), status, hit, nbars: slice.length,
    bars: slice.map((b) => ({ t: b.timestamp, o: b.open, h: b.high, l: b.low, c: b.close })),
    pattern: {
      kind, name: NAMES[kind], dir: p.dir, status, barsAgo: status === "possible" ? null : last - j,
      trigger: p.triggerAt(j), stop: p.stop, target: p.target, target2: p.target2,
      points: [...p.points.map((x) => ({ t: t(x.i), price: x.price, tag: x.tag })), ...(p.touch && status === "confirmed" ? [{ t: t(j), price: p.triggerAt(j), tag: "D" }] : [])],
      lines: p.lines.map((l) => ({ t1: t(l.i1), p1: l.p1, t2: t(l.i2), p2: l.p2, tag: l.tag })),
      history: null,
    },
  });
  console.log(`${out.length - 1}: ${NAMES[kind]} ${tf} ${status} ${t(j).slice(0,16)} dir=${p.dir} trig=${p.triggerAt(j).toFixed(1)} tgt=${p.target.toFixed(1)} stop=${p.stop.toFixed(1)} hit=${hit ?? "-"} n=${slice.length}`);
};
for (const kind of Object.keys(NAMES) as PatternKind[]) {
  const w4 = A.wins.get(kind) ?? [], w1 = B.wins.get(kind) ?? [];
  for (const e of [...w4].reverse()) push(kind, "H4", h4, e);
  if (w4.length < PER) for (const e of [...w1].reverse().slice(0, PER - w4.length)) push(kind, "H1", h1, e);
  const ps = A.poss.get(kind); if (ps) push(kind, "H4", h4, ps);
}
await Bun.write(process.argv[2]!, JSON.stringify(out));
