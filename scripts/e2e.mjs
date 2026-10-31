// End-to-end checks against a running server, driven over the Chrome
// DevTools Protocol (no dependencies). Covers the acceptance criteria that
// need a real browser: URL restore, input, motion budget, reduced motion,
// fast scrolling without blank columns, and export.
//
//   node scripts/e2e.mjs http://localhost:5173 [--quick]
//
// --quick shortens the 60 s scroll runs to 10 s.

import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const QUICK = process.argv.includes('--quick');
const SCROLL_SECONDS = QUICK ? 10 : 60;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1440,
  H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), `e2e-${PORT}`)}`, `--window-size=${W},${H}`, 'about:blank'],
  { stdio: 'ignore' },
);
let target;
for (let i = 0; i < 80 && !target; i++) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {}
  if (!target) await sleep(250);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const key = async (k, code, opts = {}) => {
  const base = { key: k, code, windowsVirtualKeyCode: opts.vk ?? 0, nativeVirtualKeyCode: opts.vk ?? 0, text: opts.text };
  await send('Input.dispatchKeyEvent', { type: opts.text ? 'keyDown' : 'rawKeyDown', ...base, autoRepeat: !!opts.repeat });
  if (!opts.hold) await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
};
const keyUp = (k, code, vk) => send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const open = async (path, reduced = false) => {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    const ok = await evaluate('!!(window.__inkscroll && window.__inkscroll.comp.revealStart !== null)').catch(() => false);
    if (ok) break;
  }
  await sleep(2200); // let the reveal finish
};
const S = (expr) => evaluate(`(()=>{const a=window.__inkscroll;return ${expr}})()`);

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};

try {
  // --- URL state ------------------------------------------------------------------
  await open('/?seed=4242&x=4800', true);
  const a = await S('({x:a.scrollX, text:a.text().join("\\n"), drift:a.drift, search:location.search})');
  await open('/?seed=4242&x=4800', true);
  const b = await S('({x:a.scrollX, text:a.text().join("\\n")})');
  check('opening /?seed=X&x=Y restores the exact view', a.x === 4800 && b.x === 4800 && a.text === b.text && a.text.replace(/\s/g, '').length > 500, { x: [a.x, b.x], same: a.text === b.text });
  check('URL carries seed and x', /seed=4242/.test(a.search) && /x=4800/.test(a.search), a.search);
  check('reduced motion: auto-drift off by default', a.drift === false);

  // reduced motion: nothing changes at rest
  await sleep(3000);
  const rm = await S('a.stats.changedPerSec');
  check('reduced motion: no cells change at rest (shimmer, sway, breathing, birds, ripple off)', rm === 0, `${rm} changes/s`);
  // hover does not ripple in reduced motion
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 400 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 420 });
  await sleep(300);
  check('reduced motion: hover does not ripple', (await S('a.stats.changedPerSec')) === 0);

  // --- motion budget at rest ---------------------------------------------------------
  await open('/?seed=4242&x=4800');
  await key(' ', 'Space', { vk: 32, text: ' ' });
  check('Space toggles auto-drift off', (await S('a.drift')) === false);
  await sleep(2500);
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    samples.push(await S('({c:a.stats.changedPerSec, n:a.stats.cells})'));
  }
  const worst = Math.max(...samples.map((s) => s.c / s.n));
  const mean = samples.reduce((x, s) => x + s.c / s.n, 0) / samples.length;
  check('fewer than 3% of cells change in any one second at rest', worst < 0.03, `worst ${(worst * 100).toFixed(2)}%, mean ${(mean * 100).toFixed(2)}%`);
  check('motion is happening at all (water, mist, sway, breathing)', mean > 0.0005, `mean ${(mean * 100).toFixed(3)}%`);

  // hover ripple
  const before = await S('a.stats.changedPerSec');
  for (let i = 0; i < 6; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600 + i * 14, y: 420 });
    await sleep(40);
  }
  await sleep(150);
  const during = await S('a.stats.changedPerSec');
  check('hover ripples the cells near the cursor', during > before + 20, { before, during });

  // --- input --------------------------------------------------------------------------
  await key(' ', 'Space', { vk: 32, text: ' ' });
  const d0 = await S('a.scrollX');
  await sleep(1500);
  const d1 = await S('a.scrollX');
  check('Space toggles auto-drift back on; it drifts right slowly', (await S('a.drift')) === true && d1 - d0 > 5 && d1 - d0 < 60, `${(d1 - d0).toFixed(1)} units in 1.5 s`);

  let x0 = await S('a.scrollX');
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 400, deltaX: 0, deltaY: 300 });
  await sleep(600);
  let x1 = await S('a.scrollX');
  check('vertical wheel scrolls horizontally', x1 - x0 > 150, `${(x1 - x0).toFixed(0)} units`);
  check('taking over with the wheel turns drift off', (await S('a.drift')) === false);
  x0 = await S('a.scrollX');
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 400, deltaX: -300, deltaY: 0 });
  await sleep(600);
  x1 = await S('a.scrollX');
  check('horizontal swipe scrolls too', x0 - x1 > 150, `${(x1 - x0).toFixed(0)} units`);

  // drag with inertia
  x0 = await S('a.scrollX');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 450, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900 - i * 30, y: 450, button: 'left', buttons: 1 });
    await sleep(16);
  }
  const atRelease = await S('a.scrollX');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 600, y: 450, button: 'left', clickCount: 1 });
  await sleep(900);
  x1 = await S('a.scrollX');
  check('drag pans with the pointer', atRelease - x0 > 200, `${(atRelease - x0).toFixed(0)} units for 300 px`);
  check('drag has light inertia on release', x1 - atRelease > 5 && x1 - atRelease < 2000, `${(x1 - atRelease).toFixed(0)} units after release`);

  // arrows
  x0 = await S('a.scrollX');
  await key('ArrowRight', 'ArrowRight', { vk: 39 });
  await sleep(500);
  x1 = await S('a.scrollX');
  check('arrow key steps', Math.abs(x1 - x0 - 54) < 3, `${(x1 - x0).toFixed(1)} units`);
  x0 = x1;
  await key('ArrowLeft', 'ArrowLeft', { vk: 37, hold: true });
  for (let i = 0; i < 12; i++) {
    await sleep(100);
    await key('ArrowLeft', 'ArrowLeft', { vk: 37, hold: true, repeat: true });
  }
  await keyUp('ArrowLeft', 'ArrowLeft', 37);
  await sleep(300);
  x1 = await S('a.scrollX');
  check('holding an arrow glides', x0 - x1 > 200, `${(x1 - x0).toFixed(0)} units in 1.2 s`);
  await sleep(700);
  const url = await evaluate('location.search');
  const xNow = await S('Math.round(a.scrollX)');
  check('URL x follows scrolling (replaceState, throttled)', url.includes(`x=${xNow}`), url);

  // --- export -------------------------------------------------------------------------
  const dl = mkdtempSync(join(tmpdir(), 'inkscroll-dl-'));
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await key('s', 'KeyS', { vk: 83, text: 's' });
  await sleep(2500);
  const files = readdirSync(dl);
  const txt = files.find((f) => f.endsWith('.txt'));
  const png = files.find((f) => f.endsWith('.png'));
  const rows = await S('a.comp.rows');
  const lines = txt ? readFileSync(join(dl, txt), 'utf8').split('\n') : [];
  check('S downloads a .txt of the view', !!txt && lines.length >= rows && lines.slice(0, rows).join('').replace(/\s/g, '').length > 300, { txt, rows, lines: lines.length });
  let pngOk = false,
    dims = null;
  if (png) {
    const buf = readFileSync(join(dl, png));
    dims = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    pngOk = dims[0] === W && dims[1] === H && statSync(join(dl, png)).size > 20000;
  }
  check('S downloads a .png at device resolution', pngOk, { png, dims });

  // new painting
  const seedBefore = await S('a.comp.displaySeed');
  await key('n', 'KeyN', { vk: 78, text: 'n' });
  await sleep(3500);
  const seedAfter = await S('a.comp.displaySeed');
  const search = await evaluate('location.search');
  check('N paints a new landscape and updates the URL', seedAfter !== seedBefore && search.includes(`seed=${seedAfter}`), { seedBefore, seedAfter });

  // --- fast scrolling ---------------------------------------------------------------------
  for (const dir of [1, -1]) {
    await open(`/?seed=777&x=${dir > 0 ? 0 : 200000}`);
    await key(' ', 'Space', { vk: 32, text: ' ' });
    await evaluate(`(()=>{
      const a = window.__inkscroll; a.stats.maxMissingCols = 0;
      window.__perf = { raf: [], work: [], missing: 0, frames: 0 };
      let last = performance.now();
      const tick = (t) => {
        const p = window.__perf; p.raf.push(t - last); p.work.push(a.stats.frameMs); last = t; p.frames++;
        if (a.stats.missingCols > p.missing) p.missing = a.stats.missingCols;
        if (!window.__stopPerf) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    const t0 = Date.now();
    while (Date.now() - t0 < SCROLL_SECONDS * 1000) {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 400, deltaX: 0, deltaY: 120 * dir });
      await sleep(16);
    }
    const p = await evaluate(`(()=>{window.__stopPerf=true; const p=window.__perf; const s=(a)=>{const b=[...a].sort((x,y)=>x-y);return {p50:b[Math.floor(b.length*0.5)],p95:b[Math.floor(b.length*0.95)],max:b[b.length-1]}}; return {frames:p.frames, raf:s(p.raf.slice(5)), work:s(p.work.slice(5)), missing:p.missing, x:window.__inkscroll.scrollX, chunks:window.__inkscroll.cache.count(), mem:window.__inkscroll.cache.bytes(), build:window.__inkscroll.cache.buildMsTotal/window.__inkscroll.cache.builds, buildMax:window.__inkscroll.cache.buildMsMax}})()`);
    const dist = Math.abs(p.x - (dir > 0 ? 0 : 200000));
    check(`${SCROLL_SECONDS} s of fast scrolling ${dir > 0 ? 'right' : 'left'}: no blank columns`, p.missing === 0 && dist > SCROLL_SECONDS * 1000, { distance: Math.round(dist), unitsPerSec: Math.round(dist / SCROLL_SECONDS), missingCols: p.missing });
    check(`  ...main-thread frame work p95 under 16 ms`, p.work.p95 < 16, { work: p.work, rafInterval: p.raf, frames: p.frames });
    check(`  ...chunk build in worker under 60 ms (mean)`, p.build < 60, { meanMs: +p.build.toFixed(1), maxMs: +p.buildMax.toFixed(1) });
    check(`  ...chunk cache under 30 MB`, p.mem < 30e6, { chunks: p.chunks, bytes: p.mem });
  }
} catch (e) {
  check('harness', false, String(e?.stack ?? e));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  chrome.kill();
  process.exit(failed.length ? 1 : 0);
}
