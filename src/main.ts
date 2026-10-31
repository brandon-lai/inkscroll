// Boot, resize, input, URL state, and the frame loop.

import './style.css';
import { buildConfig, config, SEAL, unitsPerCol } from './config';
import { ChunkCache } from './render/chunkCache';
import { Compositor, type Effects } from './render/compositor';
import { Bar } from './ui/bar';
import { DebugPanel } from './ui/debug';
import { savePng, saveText } from './ui/export';
import { Seal } from './ui/seal';
import type { Layer } from './render/build';

const params = new URLSearchParams(location.search);
const randomSeed = () => 100000 + Math.floor(Math.random() * 900000);
const parseSeed = (s: string | null) => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);

let seed = parseSeed(params.get('seed')) ?? randomSeed();
let scrollX = Number(params.get('x')) || 0;
config.whimsy = params.get('whimsy') === '1';
const debug = params.get('debug') === '1';
// ?debug=1&cfg={"inkMax":0.5,...}: start with tunables overridden (for tuning by URL).
if (debug && params.get('cfg')) {
  try {
    const o = JSON.parse(params.get('cfg')!);
    if (o.motion) Object.assign(config.motion, o.motion);
    delete o.motion;
    Object.assign(config, o);
  } catch {
    /* ignore a malformed override */
  }
}
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reducedQuery.matches;
let drift = !reduced;

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;

async function boot(): Promise<void> {
  // The atlas must not be built with a fallback font.
  try {
    await Promise.all([document.fonts.load('16px "JetBrains Mono"'), document.fonts.load('700 16px "JetBrains Mono"')]);
    await document.fonts.ready;
  } catch {
    /* render with the fallback rather than not at all */
  }

  const cache = new ChunkCache(Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)), buildConfig());
  cache.seed = seed;
  const comp = new Compositor(stage, cache);
  comp.displaySeed = seed;
  const fg = comp.fgCanvas;
  fg.removeAttribute('aria-hidden');
  fg.setAttribute('role', 'img');
  const seal = new Seal(ui);
  const bar = new Bar(ui, {
    toggleDrift: () => setDrift(!drift),
    newPainting: () => newPainting(),
    save: () => save(),
  });
  let debugPanel: DebugPanel | null = null;
  if (debug) {
    debugPanel = new DebugPanel(
      ui,
      () => {
        cache.reset(buildConfig());
        comp.invalidate();
      },
      () => comp.invalidate(),
    );
  }

  const label = () => fg.setAttribute('aria-label', `Endless ASCII landscape painting, seed ${seed}`);
  label();
  seal.set(seed);
  bar.setSeed(seed);
  bar.setDrift(drift);

  function setDrift(on: boolean): void {
    drift = on;
    bar.setDrift(on);
  }

  const resize = () => {
    comp.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  };
  resize();
  window.addEventListener('resize', resize);
  // DPR changes (moving between screens, zoom) rebuild the atlas.
  const watchDpr = () => {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => {
      resize();
      watchDpr();
    }, { once: true });
  };
  watchDpr();
  reducedQuery.addEventListener('change', () => {
    reduced = reducedQuery.matches;
    if (reduced) setDrift(false);
  });

  // --- input -----------------------------------------------------------------
  let pending = 0; // wheel distance still to apply, in world units
  let vel = 0; // inertial velocity, world units / s
  let dragging = false;
  let dragId = -1;
  let lastX = 0;
  let lastT = 0;
  let dragVel = 0;
  let arrowDir = 0;
  let arrowSince = 0;
  let dir = 1;

  const unitsPerPx = () => 1 / comp.pxPerUnit();
  const takeOver = () => {
    if (drift) setDrift(false);
  };

  window.addEventListener(
    'wheel',
    (e) => {
      if ((e.target as HTMLElement).closest('.debug')) return;
      e.preventDefault();
      const mode = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerWidth : 1;
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * mode;
      pending += d * unitsPerPx() * config.wheelGain;
      vel = 0;
      takeOver();
      bar.wake();
    },
    { passive: false },
  );

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragId = e.pointerId;
    lastX = e.clientX;
    lastT = performance.now();
    dragVel = 0;
    vel = 0;
    pending = 0;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    bar.wake();
    if (dragging && e.pointerId === dragId) {
      const now = performance.now();
      const dx = e.clientX - lastX;
      if (dx !== 0) takeOver();
      scrollX -= dx * unitsPerPx();
      const dt = Math.max(1, now - lastT) / 1000;
      dragVel = dragVel * 0.6 + (-dx * unitsPerPx() / dt) * 0.4;
      lastX = e.clientX;
      lastT = now;
    } else if (e.pointerType === 'mouse') {
      const c = comp.cellAtPx(e.clientX, e.clientY);
      comp.ripples.add(c.col, c.row, performance.now() / 1000);
    }
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragId) return;
    dragging = false;
    stage.classList.remove('dragging');
    // Light inertia: only if the pointer was still moving at release.
    vel = performance.now() - lastT < 80 ? dragVel : 0;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    bar.wake();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onButton = (e.target as HTMLElement).closest('button, a, input');
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const d = e.key === 'ArrowRight' ? 1 : -1;
      if (!e.repeat) {
        vel = 0;
        pending += d * config.arrowStep;
        arrowDir = d;
        arrowSince = performance.now();
      }
      takeOver();
      e.preventDefault();
    } else if (e.key === ' ' && !onButton) {
      setDrift(!drift);
      e.preventDefault();
    } else if ((e.key === 'n' || e.key === 'N') && !onButton) {
      newPainting();
    } else if ((e.key === 's' || e.key === 'S') && !onButton) {
      save();
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowRight' && arrowDir === 1) || (e.key === 'ArrowLeft' && arrowDir === -1)) arrowDir = 0;
  });
  window.addEventListener('blur', () => (arrowDir = 0));

  // --- actions ---------------------------------------------------------------
  function newPainting(): void {
    if (comp.outStart !== null) return;
    const next = randomSeed();
    seed = next;
    cache.setSeed(next);
    comp.outStart = performance.now() / 1000;
    seal.show(false);
    setTimeout(() => {
      comp.displaySeed = next;
      comp.outStart = null;
      comp.revealStart = null;
      revealSpan = (config.newPaintingMs / 1000) * 0.5;
      label();
      seal.set(next);
      bar.setSeed(next);
      writeUrl(true);
    }, config.newPaintingMs * 0.5);
  }

  async function save(): Promise<void> {
    const lines = comp.snapshotText();
    saveText(lines, comp.displaySeed, scrollX);
    const cv = comp.snapshotCanvas(getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#F3EEE3');
    await savePng(cv, comp.displaySeed, scrollX, { el: seal.el, color: SEAL }, comp.dpr);
  }

  // --- URL -------------------------------------------------------------------
  let lastUrlWrite = 0;
  let lastUrl = '';
  function writeUrl(force = false): void {
    const now = performance.now();
    if (!force && now - lastUrlWrite < config.urlThrottleMs) return;
    const p = new URLSearchParams(location.search);
    p.set('seed', String(comp.displaySeed));
    p.set('x', String(Math.round(scrollX)));
    const url = `${location.pathname}?${p.toString()}`;
    if (url === lastUrl) return;
    lastUrl = url;
    lastUrlWrite = now;
    history.replaceState(null, '', url);
  }

  // --- loop ------------------------------------------------------------------
  let revealSpan = config.revealMs / 1000;
  let last = performance.now();
  let raf = 0;
  const frameTimes: number[] = [];
  let changedWindow: { t: number; n: number }[] = [];
  let lastScroll = scrollX;

  const effects = (): Effects => {
    const m = config.motion;
    const r = reduced;
    return {
      water: m.water && !r,
      mist: m.mist && !r,
      sway: m.sway && !r,
      breathe: m.breathe && !r,
      boats: m.boats && !r,
      birds: m.birds && !r,
      ripple: m.ripple && !r,
      reveal: m.reveal && !r,
    };
  };

  function plan(): void {
    const wants: { layer: Layer; index: number; priority: number }[] = [];
    for (const layer of ['foreground', 'background'] as Layer[]) {
      const { first } = comp.colsAt(layer, scrollX);
      const cc = config.chunkCols;
      const k = layer === 'background' ? config.parallax : 1;
      const c0 = Math.floor(first / cc);
      const c1 = Math.floor((first + comp.cols) / cc);
      const ahead = Math.ceil((config.aheadViewports * comp.cols * k) / cc) + 1;
      const keep = Math.ceil((config.keepViewports * comp.cols * k) / cc) + 1;
      const mid = (c0 + c1) / 2;
      for (let c = c0; c <= c1; c++) wants.push({ layer, index: c, priority: Math.abs(c - mid) + (layer === 'background' ? 0.5 : 0) });
      for (let i = 1; i <= ahead; i++) {
        const c = dir > 0 ? c1 + i : c0 - i;
        wants.push({ layer, index: c, priority: 10 + i });
      }
      wants.push({ layer, index: dir > 0 ? c0 - 1 : c1 + 1, priority: 30 });
      cache.evict(layer, c0 - keep, c1 + keep, [cache.seed, comp.displaySeed]);
    }
    cache.want(wants);
  }

  function frame(): void {
    raf = requestAnimationFrame(frame);
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    const t = nowMs / 1000;

    // scroll physics
    if (pending !== 0) {
      const step = pending * (1 - Math.exp(-dt * 16));
      scrollX += step;
      pending -= step;
      if (Math.abs(pending) < 0.01) pending = 0;
    }
    if (!dragging && Math.abs(vel) > 0.5) {
      scrollX += vel * dt;
      vel *= Math.exp(-dt * config.dragInertiaDecay);
    } else if (!dragging) vel = 0;
    if (arrowDir !== 0) {
      const held = (nowMs - arrowSince) / 1000 - 0.25;
      if (held > 0) scrollX += arrowDir * Math.min(config.arrowGlideMax, held * 1800) * dt;
    }
    if (drift && !dragging && comp.revealStart !== null) scrollX += config.driftSpeed * dt;
    if (scrollX !== lastScroll) dir = scrollX > lastScroll ? 1 : -1;
    lastScroll = scrollX;

    plan();
    if (comp.revealStart === null && comp.outStart === null && comp.viewReady(comp.displaySeed, scrollX)) {
      comp.revealStart = t;
      setTimeout(() => seal.show(true), revealSpan * 1000);
    }
    config.revealMs = revealSpan * 1000;
    comp.frame(t, scrollX, effects());
    if (debugPanel) comp.drawDebug(scrollX, debugPanel.state);
    writeUrl();

    // stats
    const ft = performance.now() - nowMs;
    frameTimes.push(ft);
    if (frameTimes.length > 240) frameTimes.shift();
    changedWindow.push({ t, n: comp.stats.changed });
    changedWindow = changedWindow.filter((c) => t - c.t <= 1);
    stats.frameMs = ft;
    stats.changedPerSec = changedWindow.reduce((a, c) => a + c.n, 0);
    stats.cells = comp.stats.cells;
    stats.missingCols = comp.stats.missingCols;
    stats.maxMissingCols = Math.max(stats.maxMissingCols, comp.revealStart !== null ? comp.stats.missingCols : 0);
    if (debugPanel && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      debugPanel.setStats(
        `frame ${ft.toFixed(1)}ms p95 ${p95.toFixed(1)}ms\n` +
          `changed ${stats.changedPerSec}/s (${((stats.changedPerSec / stats.cells) * 100).toFixed(2)}% of ${stats.cells})\n` +
          `chunks ${cache.count()} (${(cache.bytes() / 1024).toFixed(0)} KB) build avg ${(cache.buildMsTotal / Math.max(1, cache.builds)).toFixed(0)}ms max ${cache.buildMsMax.toFixed(0)}ms\n` +
          `x ${Math.round(scrollX)} seed ${comp.displaySeed}${reduced ? ' (reduced motion)' : ''}`,
      );
    }
  }

  const stats = { frameMs: 0, changedPerSec: 0, cells: 0, missingCols: 0, maxMissingCols: 0 };
  // For automated checks (probe scripts) and the curious.
  (window as unknown as { __inkscroll: unknown }).__inkscroll = {
    stats,
    cache,
    comp,
    get scrollX() {
      return scrollX;
    },
    set scrollX(v: number) {
      scrollX = v;
    },
    get drift() {
      return drift;
    },
    setDrift,
    newPainting,
    text: () => comp.snapshotText(),
    unitsPerCol: unitsPerCol(),
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      cache.setPaused(true);
    } else {
      last = performance.now();
      cache.setPaused(false);
      raf = requestAnimationFrame(frame);
    }
  });
  raf = requestAnimationFrame(frame);
}

boot();
