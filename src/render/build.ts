// Build one chunk: planner -> generators -> rasterizer -> colouriser ->
// sprites. A pure function of (seed, layer, index, build config); runs in the
// worker and in tests. The output is palette indices, so the scene can grade
// the light and cycle the water without rebuilding anything.

import type { BuildConfig } from '../config';
import { bayer, dither, FALL, FAR, FAR_INK, FOL, HAZE_LEVELS, INK, MTN, MTN_HUES, MTN_SHADES, REFL, ROCK, ROOF, SPARKLE, SPRAY, TRUNK, WALL, WATER, WATER_LINE, WINDOW, ENTRIES } from '../pixel/palette';
import { BOATS, FIGURES, flipped, pagoda, pavilion, SIGN, type Sprite } from '../pixel/sprites';
import { collect } from '../world/draw';
import { BACKGROUND_MIST, FOREGROUND_MIST, mistBands } from '../world/generators/mist';
import { noiseSeed } from '../world/noise';
import { worldOptions } from '../world/options';
import { type Element, generate, type Placement, PLAN_REACH, planBackground, planChunk } from '../world/planner';
import { MAT, type Primitive, type SpritePlacement } from '../world/primitives';
import { hash } from '../world/rng';
import { rasterize } from './rasterize';

export type Layer = 'background' | 'foreground';

export interface BoatInfo {
  /** Chunk-local x of the sprite's left edge (may be negative), and y of its bottom row. */
  x: number;
  y: number;
  variant: number;
  flip: boolean;
  depth: number;
  phase: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ChunkGrid {
  index: number;
  layer: Layer;
  seed: number;
  version: number;
  w: number;
  h: number;
  /** Palette indices, row-major; 0 = transparent. */
  px: Uint8Array;
  /** Occlusion depth (world y of what is drawn there); -32768 where nothing. */
  depth: Int16Array;
  boats: BoatInfo[];
  /** Chunk-local points that glow at night (windows, lanterns) and that smoke. */
  lights: Point[];
  smoke: Point[];
  buildMs: number;
  primCount: number;
}

export function geometry(cfg: BuildConfig) {
  const upp = cfg.unitsPerPx;
  return { upp, cw: cfg.chunkPx * upp };
}

const elementCache = new Map<string, Element>();
// A chunk touches ~30 elements and its neighbours share most of them; 48 thrashed.
const ELEMENT_CACHE = 96;

function cachedGenerate(seed: number, p: Placement, cfgKey: string): Element {
  const key = `${seed}|${p.tag}|${p.chunk}|${p.idx}|${cfgKey}`;
  const hit = elementCache.get(key);
  if (hit) {
    elementCache.delete(key);
    elementCache.set(key, hit);
    return hit;
  }
  const el = generate(seed, p);
  elementCache.set(key, el);
  if (elementCache.size > ELEMENT_CACHE) elementCache.delete(elementCache.keys().next().value!);
  return el;
}

export function clearElementCache(): void {
  elementCache.clear();
}

/** The elements whose geometry reaches into world x range [x0, x1). */
export function elementsFor(seed: number, layer: Layer, index: number, x0: number, x1: number, cfg: BuildConfig): Element[] {
  worldOptions.whimsy = cfg.whimsy;
  worldOptions.waterfallChance = cfg.waterfallChance;
  const cfgKey = `${cfg.whimsy ? 1 : 0}|${cfg.chunkPx}|${cfg.unitsPerPx}|${cfg.waterfallChance}`;
  const plan = { chunkPx: cfg.chunkPx, unitsPerPx: cfg.unitsPerPx };
  const placements: Placement[] = [];
  if (layer === 'foreground') {
    for (let c = index - PLAN_REACH; c <= index + PLAN_REACH; c++) placements.push(...planChunk(seed, c, plan));
  } else {
    for (let c = index - 3; c <= index; c++) placements.push(...planBackground(seed, c, plan));
  }
  const out: Element[] = [];
  for (const p of placements) {
    if (p.x1 < x0 || p.x0 > x1) continue;
    const el = cachedGenerate(seed, p, cfgKey);
    if (el.x1 < x0 || el.x0 > x1) continue;
    out.push(el);
  }
  return out;
}

/** Perceived lightness of each palette entry, for reflections. */
const LUM = ENTRIES.map((e) => (0.3 * e.rgb[0] + 0.59 * e.rgb[1] + 0.11 * e.rgb[2]) / 255);
const IS_WATER = new Uint8Array(256);
for (const i of [...WATER, WATER_LINE, ...SPARKLE, ...REFL]) IS_WATER[i] = 1;

export function buildChunk(seed: number, layer: Layer, index: number, cfg: BuildConfig, version = 0): ChunkGrid {
  const t0 = performance.now();
  noiseSeed(seed);
  const { upp, cw } = geometry(cfg);
  const W = cfg.chunkPx,
    H = cfg.worldPx,
    S = cfg.samples;
  const x0 = index * cw;
  const x1 = x0 + cw;
  const elements = elementsFor(seed, layer, index, x0 - 2, x1 + 2, cfg);

  // Painter's order: by depth (the original sorts by y), then x, then id.
  const drawables = elements.map((e) => ({ depth: e.placement.depth, x: e.placement.x, order: e.placement.chunk * 4096 + e.placement.idx, prims: e.prims }));
  const mist = layer === 'foreground' ? FOREGROUND_MIST : BACKGROUND_MIST;
  mist.forEach((lv, k) => {
    const got = collect('mist', lv.depth, () => mistBands([lv], x0, x1, k + (layer === 'foreground' ? 0 : 10)));
    drawables.push({ depth: lv.depth, x: -Infinity, order: -1, prims: got.prims });
  });
  drawables.sort((a, b) => a.depth - b.depth || a.x - b.x || a.order - b.order);
  const prims: Primitive[] = [];
  for (const d of drawables) for (const p of d.prims) prims.push(p);

  const r = rasterize(prims, x0, 0, W * S, H * S, upp / S, upp / S);
  const px = new Uint8Array(W * H);
  const depth = new Int16Array(W * H).fill(-32768);
  const lights: Point[] = [];
  const smoke: Point[] = [];
  const fg = layer === 'foreground';
  const horizonPx = cfg.horizonY / upp;
  const ns = S * S;
  const hazeSpan = cfg.depthNear - cfg.depthFar;

  const mats = new Int32Array(16);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ink = 0,
        opa = 0,
        line = 0,
        mistAmt = 0,
        dmax = -Infinity;
      mats.fill(0);
      for (let j = 0; j < S; j++) {
        const row = (y * S + j) * r.w + x * S;
        for (let i = 0; i < S; i++) {
          const k = row + i;
          ink += r.ink[k];
          opa += r.opa[k];
          mistAmt += r.mist[k];
          if (r.line[k] > line) line = r.line[k];
          if (r.depth[k] > dmax) dmax = r.depth[k];
          mats[r.mat[k]]++;
        }
      }
      ink /= ns;
      opa /= ns;
      mistAmt /= ns;
      let mat = 0,
        best = 0;
      for (let m = 1; m < 12; m++)
        if (mats[m] > best) {
          best = mats[m];
          mat = m;
        }
      const o = y * W + x;
      const wy = y * upp;
      const d = dmax === -Infinity ? 0 : dmax;
      if (dmax !== -Infinity) depth[o] = Math.max(-32767, Math.min(32767, Math.round(dmax)));
      // Atmospheric haze: farther (smaller depth) and misted things lean to the colour of air.
      const hz = Math.min(HAZE_LEVELS - 1, Math.max(0, dither(((cfg.depthNear - d) / hazeSpan) * 1.7 + mistAmt * 3.2, x, y)));

      if (!fg) {
        if (line >= cfg.lineMin && opa > 0.15) px[o] = FAR_INK;
        else if (opa >= 0.5) px[o] = FAR[Math.min(FAR.length - 1, Math.max(0, dither(ink * 22 - mistAmt * 4, x, y)))];
        continue;
      }

      if (line >= cfg.lineMin && (opa > 0.2 || mat !== 0)) {
        px[o] = INK[hz][0];
        continue;
      }
      if (opa < 0.5 || mat === 0 || mat === MAT.water) {
        if (wy >= cfg.horizonY) {
          depth[o] = -32768;
          px[o] = mat === MAT.water && ink > 0.05 ? WATER_LINE : lake(x + index * W, y, horizonPx, H);
        }
        continue;
      }
      switch (mat) {
        case MAT.mountain: {
          // Ochre foot, green slope, teal, azurite peak; higher above its own base is bluer.
          const rel = (d - wy) / 230 + (vnoise((x + index * W) * 0.02, y * 0.02, seed) - 0.5) * 0.5;
          const hue = Math.min(MTN_HUES - 1, Math.max(0, dither(rel * 3.4 + 0.2, x, y)));
          const shade = Math.min(MTN_SHADES - 1, Math.max(0, dither(0.7 + ink * cfg.inkShade - rel * 0.6, x, y)));
          px[o] = MTN[hue][hz][shade];
          break;
        }
        case MAT.rock:
          px[o] = ROCK[hz][Math.min(3, Math.max(0, dither(0.4 + ink * 7, x, y)))];
          break;
        case MAT.foliage:
          px[o] = FOL[hz][Math.min(4, Math.max(0, dither(ink * 8 - 0.6, x, y)))];
          break;
        case MAT.trunk:
          px[o] = TRUNK[hz][Math.min(2, Math.max(0, dither(ink * 6, x, y)))];
          break;
        case MAT.architecture:
          if (ink > 0.16) px[o] = ROOF[hz][ink > 0.3 ? 1 : 0];
          else if (h01(x + index * W, y >> 1, 5) < 0.125 && hz < 2) {
            px[o] = WINDOW;
            if (h01(x + index * W, y, 9) < 0.25) lights.push({ x, y });
          } else px[o] = WALL[hz][ink > 0.07 ? 1 : 0];
          break;
        case MAT.farMountain:
          px[o] = FAR[Math.min(FAR.length - 1, dither(ink * 22, x, y))];
          break;
        default:
          px[o] = MTN[1][hz][1];
      }
    }
  }

  if (fg) {
    reflect(px, W, H, horizonPx, cfg.reflectPx);
  }

  const boats: BoatInfo[] = [];
  for (const e of elements) {
    for (const s of e.sprites) {
      const sx = s.x / upp - index * W;
      const sy = s.y / upp;
      if (s.kind === 'boat') {
        if (sx >= 0 && sx < W) boats.push({ x: Math.round(sx), y: Math.round(sy), variant: s.variant, flip: s.flip, depth: s.depth, phase: ((s.x * 0.37) % 1 + 1) % 1 });
      } else if (s.kind === 'waterfall') {
        if (fg) waterfall(px, depth, W, H, Math.round(sx), Math.round(sy), Math.round(s.variant / upp), s.depth, hash(s.x | 0, s.y | 0));
      } else if (s.kind === 'smoke') {
        if (sx >= 0 && sx < W) smoke.push({ x: Math.round(sx), y: Math.round(sy) });
      } else if (fg) {
        stamp(px, depth, W, H, spriteFor(s), Math.round(sx), Math.round(sy), s.depth, lights);
      }
    }
  }

  return { index, layer, seed, version, w: W, h: H, px, depth, boats, lights, smoke, buildMs: performance.now() - t0, primCount: prims.length };
}

/** Integer hash to 0..1 (no allocation; the colouriser calls it per pixel). */
function h01(a: number, b: number, s: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * One octave of smooth value noise. The colouriser calls it per pixel, where
 * the generators' four-octave Perlin was the single biggest cost.
 */
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  let xf = x - xi,
    yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const a = h01(xi, yi, s),
    b = h01(xi + 1, yi, s),
    c = h01(xi, yi + 1, s),
    d = h01(xi + 1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** The lake: lighter near the horizon (it holds the sky), deeper toward you, with glints. */
function lake(gx: number, y: number, horizonPx: number, H: number): number {
  const v = (y - horizonPx) / (H - horizonPx);
  const h = (h01(gx, y, 11) * 4294967296) >>> 0;
  if ((h & 255) < 7 && v > 0.04) return SPARKLE[(h >> 8) & 3];
  // Long faint streaks of light on the water.
  if (vnoise(gx * 0.05, y * 0.9, 3) > 0.7 && v < 0.75) return WATER[Math.min(5, 5 - Math.floor(v * 2.5))];
  return WATER[Math.max(0, Math.min(5, dither(5.2 - v * 6, gx, y)))];
}

/** Mirror land into the water below each shore, darkened and fading with distance. */
function reflect(px: Uint8Array, W: number, H: number, horizonPx: number, reach: number): void {
  const top = Math.ceil(horizonPx);
  for (let x = 0; x < W; x++) {
    let shore = -1;
    for (let y = top; y < H; y++) {
      const o = y * W + x;
      const v = px[o];
      if (v === 0) continue;
      if (!IS_WATER[v]) {
        shore = -1;
        continue;
      }
      if (shore < 0) {
        // First water row under land?
        const above = y > 0 ? px[o - W] : 0;
        if (above && !IS_WATER[above]) shore = y;
        else continue;
      }
      const dd = y - shore;
      if (dd > reach) continue;
      const sy = shore - 1 - dd;
      if (sy < 0) continue;
      const src = px[sy * W + x];
      if (!src || IS_WATER[src]) continue;
      // Ripples break up the reflection: skip some rows, more the farther down.
      if (bayer(x, y) < (dd / reach) * 0.9 || (y & 1 && bayer(x + 1, y) < 0.3)) continue;
      px[o] = REFL[Math.min(REFL.length - 1, Math.max(0, Math.round((1 - LUM[src]) * 5 - 0.5)))];
    }
  }
}

function waterfall(px: Uint8Array, depth: Int16Array, W: number, H: number, x: number, top: number, drop: number, d: number, h: number): void {
  const width = 2 + (h & 1);
  let bottom = top;
  let drawn = 0;
  for (let y = top; y < Math.min(H, top + drop + 2); y++) {
    const sway = Math.round(Math.sin(y * 0.15 + (h & 7)) * 0.6);
    let any = false;
    for (let k = 0; k < width; k++) {
      const xx = x + k + sway;
      if (xx < 0 || xx >= W || y < 0) continue;
      const o = y * W + xx;
      if (depth[o] > d + 2 || IS_WATER[px[o]] || !px[o]) continue;
      // Phase by pairs of rows: cycling the palette slides long streaks downward.
      px[o] = FALL[((y >> 1) + k) & 3];
      any = true;
      drawn++;
    }
    if (any) bottom = y;
  }
  // Spray where it lands, only under a fall you can actually see.
  if (drawn < width * 10) return;
  for (let k = -2; k <= width + 1; k++) {
    for (let j = -1; j <= 0; j++) {
      const xx = x + k,
        y = bottom + j;
      if (xx < 0 || xx >= W || y < 0 || y >= H) continue;
      if (bayer(xx, y) < 0.55) px[y * W + xx] = SPRAY[(xx + y) & 1];
    }
  }
}

const SPRITE_CACHE = new Map<string, Sprite>();
function spriteFor(s: SpritePlacement): Sprite {
  const key = `${s.kind}:${s.variant}:${s.flip}`;
  let sp = SPRITE_CACHE.get(key);
  if (!sp) {
    let base: Sprite;
    if (s.kind === 'figure') base = FIGURES[s.variant % FIGURES.length];
    else if (s.kind === 'pagoda') base = pagoda(s.variant ? 7 : 5, s.variant ? 15 : 13);
    else if (s.kind === 'pavilion') base = pavilion(s.variant >= 2 ? 2 : 1, (s.variant & 1) === 1);
    else base = SIGN;
    sp = s.flip ? flipped(base) : base;
    SPRITE_CACHE.set(key, sp);
  }
  return sp;
}

/** Draw a sprite standing on (cx, baseY), hidden where something nearer covers it. */
function stamp(px: Uint8Array, depth: Int16Array, W: number, H: number, sp: Sprite, cx: number, baseY: number, d: number, lights: Point[]): void {
  const left = cx - (sp.w >> 1);
  const top = baseY - sp.h;
  for (let y = 0; y < sp.h; y++) {
    const yy = top + y;
    if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < sp.w; x++) {
      const c = sp.px[y * sp.w + x];
      if (!c) continue;
      const xx = left + x;
      if (xx < 0 || xx >= W) continue;
      const o = yy * W + xx;
      if (depth[o] > d + 1) continue;
      px[o] = c;
      depth[o] = d;
      if (ENTRIES[c].glow && ((xx + yy) & 1) === 0) lights.push({ x: xx, y: yy });
    }
  }
}

export { BOATS };
