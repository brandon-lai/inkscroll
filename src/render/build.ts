// Build one chunk: planner -> generators -> rasterizer -> glyph mapper ->
// sprites. Pure function of (seed, layer, index, build config); runs in the
// worker and in tests.

import { type BuildConfig, glyphIndex } from '../config';
import { collect } from '../world/draw';
import { BACKGROUND_MIST, FOREGROUND_MIST, mistBands } from '../world/generators/mist';
import { artFor, PAPER_CHAR, spriteMeta } from '../world/generators/sprites';
import { noiseSeed } from '../world/noise';
import { worldOptions } from '../world/options';
import { type Element, generate, type Placement, PLAN_REACH, planBackground, planChunk } from '../world/planner';
import { MAT, type Primitive, type SpritePlacement } from '../world/primitives';
import { type CellMaps, FLAG_OPAQUE, mapCells } from './glyphMapper';
import { rasterize } from './rasterize';

export type Layer = 'background' | 'foreground';

export interface BoatSprite {
  /** Global column of the sprite's left edge and row of its bottom line. */
  col: number;
  row: number;
  lines: string[];
  depth: number;
  tone: number;
  /** Per-boat phase so boats do not bob in unison. */
  phase: number;
}

export interface ChunkGrid extends CellMaps {
  index: number;
  layer: Layer;
  seed: number;
  version: number;
  cols: number;
  rows: number;
  boats: BoatSprite[];
  buildMs: number;
  primCount: number;
}

/** The config fields that shape the world, with derived sizes. */
export function geometry(cfg: BuildConfig) {
  const upr = cfg.unitsPerRow;
  const upc = (upr * cfg.cell.w) / cfg.cell.h;
  return { upr, upc, cw: cfg.chunkCols * upc };
}

// Generated elements are reused across neighbouring chunks (a mountain spans
// two or three). Small LRU keyed by everything that affects the output.
const elementCache = new Map<string, Element>();
const ELEMENT_CACHE = 48;

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

interface Drawable {
  depth: number;
  x: number;
  order: number;
  prims: Primitive[];
}

/** The elements whose geometry reaches into world x range [x0, x1). */
export function elementsFor(seed: number, layer: Layer, index: number, x0: number, x1: number, cfg: BuildConfig): Element[] {
  const cfgKey = `${cfg.whimsy ? 1 : 0}|${cfg.chunkCols}|${cfg.cell.w}x${cfg.cell.h}|${cfg.unitsPerRow}`;
  const placements: Placement[] = [];
  const asConfig = { chunkCols: cfg.chunkCols, cell: cfg.cell, unitsPerRow: cfg.unitsPerRow } as never;
  if (layer === 'foreground') {
    for (let c = index - PLAN_REACH; c <= index + PLAN_REACH; c++) placements.push(...planChunk(seed, c, asConfig));
  } else {
    for (let c = index - 3; c <= index; c++) placements.push(...planBackground(seed, c, asConfig));
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

export function buildChunk(seed: number, layer: Layer, index: number, cfg: BuildConfig, version = 0): ChunkGrid {
  const t0 = performance.now();
  noiseSeed(seed);
  worldOptions.whimsy = cfg.whimsy;
  const { upr, upc, cw } = geometry(cfg);
  const cols = cfg.chunkCols;
  const rows = cfg.worldRows;
  const margin = 1;
  const x0 = index * cw;
  const rx0 = x0 - margin * upc;
  const rx1 = x0 + (cols + margin) * upc;

  const elements = elementsFor(seed, layer, index, rx0 - 2, rx1 + 2, cfg);

  // Painter's order: by depth (the original sorts chunks by y), then x, then id.
  const drawables: Drawable[] = elements.map((e) => ({
    depth: e.placement.depth,
    x: e.placement.x,
    order: e.placement.chunk * 4096 + e.placement.idx,
    prims: e.prims,
  }));
  const mist = layer === 'foreground' ? FOREGROUND_MIST : BACKGROUND_MIST;
  mist.forEach((lv, k) => {
    const got = collect('mist', lv.depth, () => mistBands([lv], rx0, rx1, k + (layer === 'foreground' ? 0 : 10)));
    drawables.push({ depth: lv.depth, x: -Infinity, order: -1, prims: got.prims });
  });
  drawables.sort((a, b) => a.depth - b.depth || a.x - b.x || a.order - b.order);
  const prims: Primitive[] = [];
  for (const d of drawables) for (const p of d.prims) prims.push(p);

  const sx = cfg.samplesX,
    sy = cfg.samplesY;
  const raster = rasterize(prims, rx0, 0, (cols + 2 * margin) * sx, rows * sy, upc / sx, upr / sy);
  const maps = mapCells(raster, cols, rows, sx, sy, cfg, { toneScale: layer === 'background' ? 0.62 : 1, margin });

  const col0 = index * cols;
  const boats: BoatSprite[] = [];
  for (const e of elements) {
    for (const s of e.sprites) {
      if (s.kind === 'boat') {
        const lines = artFor('boat', s.variant, s.flip);
        const w = lines[0].length;
        const col = Math.floor(s.x / upc) - (w >> 1);
        const anchor = Math.floor(s.x / upc);
        if (anchor >= col0 && anchor < col0 + cols) {
          const meta = spriteMeta('boat', s.variant);
          boats.push({ col, row: Math.floor(s.y / upr) + meta.dy, lines, depth: s.depth, tone: fadeTone(meta.tone, s.y), phase: (s.x * 0.37) % 1 });
        }
      } else {
        stampSprite(maps, s, col0, cols, rows, upc, upr);
      }
    }
  }

  return {
    ...maps,
    index,
    layer,
    seed,
    version,
    cols,
    rows,
    boats,
    buildMs: performance.now() - t0,
    primCount: prims.length,
  };
}

/** Farther (smaller y) sprites are drawn in lighter ink. */
export function fadeTone(tone: number, y: number): number {
  return Math.max(1, Math.min(7, tone - Math.round(Math.max(0, 640 - y) / 160)));
}

function stampSprite(maps: CellMaps, s: SpritePlacement, col0: number, cols: number, rows: number, upc: number, upr: number): void {
  let lines: string[];
  let dy = -1;
  let tone: number;
  if (s.kind === 'label') {
    lines = [s.text ?? ''];
    dy = 0;
    tone = 6;
  } else {
    lines = artFor(s.kind, s.variant, s.flip);
    const meta = spriteMeta(s.kind, s.variant);
    dy = meta.dy;
    tone = fadeTone(meta.tone, s.y);
  }
  const w = lines[0].length;
  const left = Math.floor(s.x / upc) - (w >> 1);
  const bottom = Math.floor(s.y / upr) + dy;
  const top = bottom - lines.length + 1;
  const material = s.kind === 'figure' ? MAT.figure : MAT.architecture;
  const depth = Math.round(s.depth);
  for (let r = 0; r < lines.length; r++) {
    const row = top + r;
    if (row < 0 || row >= rows) continue;
    const line = lines[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ') continue;
      const gc = left + c - col0;
      if (gc < 0 || gc >= cols) continue;
      const ci = row * cols + gc;
      // Hidden behind something nearer drawn over this spot.
      if (maps.depth[ci] > depth + 1) continue;
      maps.glyph[ci] = ch === PAPER_CHAR ? 32 : glyphIndex(ch);
      maps.tone[ci] = tone;
      maps.material[ci] = material;
      maps.flags[ci] = FLAG_OPAQUE;
      maps.depth[ci] = depth;
    }
  }
}
