// Boot, resize, input, time of day, URL state, and the frame loop.

import './style.css';
import { buildConfig, config, SEAL } from './config';
import type { Layer } from './render/build';
import { ChunkCache } from './render/chunkCache';
import { type Effects, Scene } from './render/scene';
import { Bar } from './ui/bar';
import { DebugPanel } from './ui/debug';
import { Seal } from './ui/seal';
import { noiseSeed } from './world/noise';

const params = new URLSearchParams(location.search);
const randomSeed = () => 100000 + Math.floor(Math.random() * 900000);
const parseSeed = (s: string | null) => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);

let seed = parseSeed(params.get('seed')) ?? randomSeed();
let scrollX = Number(params.get('x')) || 0;
config.whimsy = params.get('whimsy') === '1';
const debug = params.get('debug') === '1';
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
/** ?time=0.8 pins the time of day (0 midnight, 0.5 noon, 0.75 sunset). */
const pinnedTime = params.has('time') && Number.isFinite(Number(params.get('time'))) ? Number(params.get('time')) : null;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reducedQuery.matches;
let drift = !reduced;

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;

async function boot(): Promise<void> {
  try {
    await Promise.all([document.fonts.load('12px "JetBrains Mono"'), document.fonts.ready]);
  } catch {
    /* the bar can use a fallback */
  }

  const cache = new ChunkCache(Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)), buildConfig());
  cache.seed = seed;
  noiseSeed(seed);
  const scene = new Scene(stage, cache);
  scene.displaySeed = seed;
  scene.canvas.setAttribute('role', 'img');
  const seal = new Seal(ui);
  const bar = new Bar(ui, {
    toggleDrift: () => setDrift(!drift),
    newPainting: () => newPainting(),
    save: () => save(),
    nextTime: () => skipTime(),
  });
  let debugPanel: DebugPanel | null = null;
  if (debug) {
    debugPanel = new DebugPanel(ui, () => cache.reset(buildConfig()), (v) => {
      timeOffset += v - timeOfDay();
    });
  }

  const label = () => scene.canvas.setAttribute('aria-label', `Endless pixel-art landscape painting, seed ${seed}: mountains, mist, a lake, boats and small travellers, at ${scene.light.phase}`);
  label();
  seal.set(seed);
  bar.setSeed(seed);
  bar.setDrift(drift);

  function setDrift(on: boolean): void {
    drift = on;
    bar.setDrift(on);
  }

  const resize = () => scene.resize(window.innerWidth, window.innerHeight);
  resize();
  window.addEventListener('resize', resize);
  reducedQuery.addEventListener('change', () => {
    reduced = reducedQuery.matches;
    if (reduced) setDrift(false);
  });

  // --- time of day ---------------------------------------------------------------------
  const startAt = performance.now() / 1000;
  let timeOffset = 0;
  function timeOfDay(): number {
    if (pinnedTime !== null) return pinnedTime + timeOffset;
    // Reduced motion: the light holds still (a calm afternoon) unless skipped.
    if (reduced) return config.startTime + timeOffset;
    return config.startTime + timeOffset + (performance.now() / 1000 - startAt) / config.dayLength;
  }
  /** T / the time button: jump to the next part of the day. */
  function skipTime(): void {
    const stops = [0.27, 0.45, 0.7, 0.76, 0.82, 0.95];
    const t = ((timeOfDay() % 1) + 1) % 1;
    const next = stops.find((s) => s > t + 0.01) ?? stops[0] + 1;
    timeOffset += next - t;
  }

  // --- input ---------------------------------------------------------------------------
  let pending = 0;
  let vel = 0;
  let dragging = false;
  let dragId = -1;
  let downX = 0;
  let downY = 0;
  let moved = 0;
  let lastX = 0;
  let lastT = 0;
  let dragVel = 0;
  let arrowDir = 0;
  let arrowSince = 0;
  let dir = 1;

  const unitsPerPx = () => 1 / scene.pxPerUnit();
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
    downX = lastX = e.clientX;
    downY = e.clientY;
    moved = 0;
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
  let lastHover = 0;
  stage.addEventListener('pointermove', (e) => {
    bar.wake();
    if (dragging && e.pointerId === dragId) {
      const now = performance.now();
      const dx = e.clientX - lastX;
      moved = Math.max(moved, Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY));
      if (moved > 4) {
        if (dx !== 0) takeOver();
        scrollX -= dx * unitsPerPx();
        const dt = Math.max(1, now - lastT) / 1000;
        dragVel = dragVel * 0.6 + ((-dx * unitsPerPx()) / dt) * 0.4;
      }
      lastX = e.clientX;
      lastT = now;
    } else if (e.pointerType === 'mouse' && effects().ripples) {
      // Trailing a cursor across the lake leaves ripples.
      const now = performance.now();
      if (now - lastHover < 120) return;
      lastHover = now;
      const hit = scene.hitAt(e.clientX, e.clientY, scrollX);
      if (hit.kind === 'water') scene.ripple(hit.fgX, hit.row);
    }
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragId) return;
    dragging = false;
    stage.classList.remove('dragging');
    if (moved <= 4) {
      // A tap: release a lantern into the sky, or drop a ripple on the lake.
      const hit = scene.hitAt(e.clientX, e.clientY, scrollX);
      if (hit.kind === 'water') scene.ripple(hit.fgX, hit.row);
      else scene.releaseLantern(hit.fgX, hit.row);
      return;
    }
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
    } else if ((e.key === 't' || e.key === 'T') && !onButton) {
      skipTime();
    }
  });
  window.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowRight' && arrowDir === 1) || (e.key === 'ArrowLeft' && arrowDir === -1)) arrowDir = 0;
  });
  window.addEventListener('blur', () => (arrowDir = 0));

  // --- actions ---------------------------------------------------------------------------
  function newPainting(): void {
    if (scene.outStart !== null) return;
    const next = randomSeed();
    seed = next;
    cache.setSeed(next);
    scene.outStart = performance.now() / 1000;
    seal.show(false);
    setTimeout(() => {
      noiseSeed(next);
      scene.displaySeed = next;
      scene.outStart = null;
      scene.revealStart = null;
      scene.revealSpan = (config.newPaintingMs / 1000) * 0.5;
      label();
      seal.set(next);
      bar.setSeed(next);
      writeUrl(true);
    }, config.newPaintingMs * 0.5);
  }

  async function save(): Promise<void> {
    const cv = scene.snapshot(Math.min(2, window.devicePixelRatio || 1));
    const ctx = cv.getContext('2d')!;
    // The seal, where it sits on screen.
    const r = seal.el.getBoundingClientRect();
    if (r.width > 0) {
      const k = cv.width / window.innerWidth;
      const cs = getComputedStyle(seal.el);
      ctx.font = `${parseFloat(cs.fontSize) * k}px "JetBrains Mono", monospace`;
      ctx.fillStyle = SEAL;
      ctx.textBaseline = 'top';
      Seal.lines(scene.displaySeed).forEach((l, i) => ctx.fillText(l, (r.left + parseFloat(cs.paddingLeft)) * k, (r.top + parseFloat(cs.paddingTop)) * k + i * parseFloat(cs.lineHeight) * k));
    }
    await new Promise<void>((res) =>
      cv.toBlob((b) => {
        if (b) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = `inkscroll-${scene.displaySeed}-${Math.round(scrollX)}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }
        res();
      }, 'image/png'),
    );
  }

  // --- URL -----------------------------------------------------------------------------
  let lastUrlWrite = 0;
  let lastUrl = '';
  function writeUrl(force = false): void {
    const now = performance.now();
    if (!force && now - lastUrlWrite < config.urlThrottleMs) return;
    const p = new URLSearchParams(location.search);
    p.set('seed', String(scene.displaySeed));
    p.set('x', String(Math.round(scrollX)));
    const url = `${location.pathname}?${p.toString()}`;
    if (url === lastUrl) return;
    lastUrl = url;
    lastUrlWrite = now;
    history.replaceState(null, '', url);
  }

  // --- loop ----------------------------------------------------------------------------
  let last = performance.now();
  let raf = 0;
  let lastScroll = scrollX;
  let lastPhase = '';
  const frameTimes: number[] = [];

  function effects(): Effects {
    const m = config.motion;
    const r = reduced;
    return {
      water: m.water && !r,
      clouds: m.clouds && !r,
      mist: m.mist,
      boats: m.boats && !r,
      birds: m.birds && !r,
      smoke: m.smoke && !r,
      night: m.night,
      weather: m.weather && !r,
      ripples: m.ripples && !r,
      reveal: m.reveal && !r,
    };
  }

  function plan(): void {
    const wants: { layer: Layer; index: number; priority: number }[] = [];
    const cp = config.chunkPx;
    for (const layer of ['foreground', 'background'] as Layer[]) {
      const off = scene.offset(layer, scrollX);
      const k = layer === 'background' ? config.parallax : 1;
      const c0 = Math.floor(off / cp);
      const c1 = Math.floor((off + scene.W) / cp);
      const ahead = Math.ceil((config.aheadViewports * scene.W * k) / cp) + 1;
      const keep = Math.ceil((config.keepViewports * scene.W * k) / cp) + 1;
      const mid = (c0 + c1) / 2;
      for (let c = c0; c <= c1; c++) wants.push({ layer, index: c, priority: Math.abs(c - mid) + (layer === 'background' ? 0.5 : 0) });
      for (let i = 1; i <= ahead; i++) wants.push({ layer, index: dir > 0 ? c1 + i : c0 - i, priority: 10 + i });
      wants.push({ layer, index: dir > 0 ? c0 - 1 : c1 + 1, priority: 30 });
      cache.evict(layer, c0 - keep, c1 + keep, [cache.seed, scene.displaySeed]);
    }
    cache.want(wants);
  }

  function frame(): void {
    raf = requestAnimationFrame(frame);
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    const t = nowMs / 1000;

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
    if (drift && !dragging && scene.revealStart !== null) scrollX += config.driftSpeed * dt;
    if (scrollX !== lastScroll) dir = scrollX > lastScroll ? 1 : -1;
    lastScroll = scrollX;

    plan();
    if (scene.revealStart === null && scene.outStart === null && scene.viewReady(scene.displaySeed, scrollX)) {
      scene.revealStart = reduced ? 1000 : t;
      setTimeout(() => seal.show(true), scene.revealSpan * 1000);
    }
    // Reduced motion: animation time stands still (mist, water, particles hold).
    scene.frame(reduced ? 1000 : t, timeOfDay(), scrollX, effects());
    if (scene.light.phase !== lastPhase) {
      lastPhase = scene.light.phase;
      bar.setTime(lastPhase);
      label();
    }
    writeUrl();

    frameTimes.push(scene.stats.frameMs);
    if (frameTimes.length > 240) frameTimes.shift();
    stats.frameMs = scene.stats.frameMs;
    stats.missingCols = scene.stats.missingCols;
    if (scene.revealStart !== null && scene.outStart === null) stats.maxMissingCols = Math.max(stats.maxMissingCols, scene.stats.missingCols);
    if (debugPanel && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      debugPanel.setStats(
        `frame ${scene.stats.frameMs.toFixed(1)}ms p95 ${(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)}ms\n` +
          `${scene.W}x${scene.H} px at ${scene.scale}x · ${scene.stats.particles} particles\n` +
          `chunks ${cache.count()} (${(cache.bytes() / 1024).toFixed(0)} KB) build avg ${(cache.buildMsTotal / Math.max(1, cache.builds)).toFixed(0)}ms max ${cache.buildMsMax.toFixed(0)}ms\n` +
          `time ${(((timeOfDay() % 1) + 1) % 1).toFixed(3)} ${scene.light.phase} · rain ${scene.rain.toFixed(2)}\n` +
          `x ${Math.round(scrollX)} seed ${scene.displaySeed}${reduced ? ' (reduced motion)' : ''}`,
      );
    }
  }

  const stats = { frameMs: 0, missingCols: 0, maxMissingCols: 0 };
  (window as unknown as { __inkscroll: unknown }).__inkscroll = {
    stats,
    cache,
    scene,
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
    skipTime,
    timeOfDay,
    viewHash: () => scene.viewHash(scrollX),
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
