// Read-only screenshots of the live web app as the showcase account, via Chrome DevTools. Navigation only: nothing is clicked unless a shot asks.
// CAP_HOST=www.example.com CAP_TOKEN=... bun capture_web.ts <shots.json> <outdir>
// A shot: {name, path, w, h, dpr, at:[ms after load, ...], full}. Portrait 900x1125 at dpr 2.4 gives 2160x2700, twice a 1080x1350 post.
const [shotsFile, out] = process.argv.slice(2);
const tok = (process.env.CAP_TOKEN ?? "").trim(); // the session token, if the pages need sign in; never saved here
const HOST = process.env.CAP_HOST ?? "www.strategydynamics.co.uk";
const COOKIE = process.env.CAP_COOKIE ?? "__Host-sd_session";
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TMPDIR ?? "/tmp"}/cap-profile-${port}`, "--hide-scrollbars", "--enable-webgl", "--use-angle=metal", "--window-size=1440,900", "about:blank"], { stdout: "ignore", stderr: "ignore" });
await Bun.sleep(2500);
const tabs: any[] = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map<number, (v: any) => void>();
ws.onmessage = (e) => { const m = JSON.parse(e.data as string); if (m.id && wait.has(m.id)) { wait.get(m.id)!(m.result ?? m.error); wait.delete(m.id); } };
const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Network.enable");
if (tok) await send("Network.setCookie", { name: COOKIE, value: tok, domain: HOST, path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
type Shot = { name: string; path: string; w?: number; h?: number; dpr?: number; mobile?: boolean; at?: number[]; scroll?: number; js?: string; jsAt?: number; full?: boolean };
const shots: Shot[] = await Bun.file(shotsFile!).json();
for (const s of shots) {
  const w = s.w ?? 1440, h = s.h ?? 900;
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: s.dpr ?? 2, mobile: !!s.mobile });
  await send("Page.navigate", { url: `https://${HOST}${s.path}` });
  const t0 = Date.now(); let did = false;
  for (const [i, at] of (s.at ?? [6000]).entries()) {
    if (s.js && !did && at >= (s.jsAt ?? 0)) { await Bun.sleep(Math.max(0, (s.jsAt ?? 0) - (Date.now() - t0))); await send("Runtime.evaluate", { expression: s.js, awaitPromise: true }); did = true; }
    await Bun.sleep(Math.max(0, at - (Date.now() - t0)));
    if (s.scroll && i === 0) { await send("Runtime.evaluate", { expression: `(document.scrollingElement||document.body).scrollTo(0,${s.scroll});document.querySelectorAll('main,.page,.shell-main').forEach(e=>e.scrollTo&&e.scrollTo(0,${s.scroll}))` }); await Bun.sleep(400); }
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!s.full });
    const f = `${out}/${s.name}${(s.at ?? []).length > 1 ? `-${at}` : ""}.png`;
    await Bun.write(f, Buffer.from(r.data, "base64")); console.log(f);
  }
}
ws.close(); chrome.kill();
