// Rasterizer: primitives -> per-sample ink, opacity, material and depth maps.
//
// The PRD sketches this on an OffscreenCanvas 2D context. Canvas always
// anti-aliases polygon edges, which smears colour-coded material ids into
// meaningless blends, and it ties the pipeline to a browser. A small scanline
// filler is fast enough at 4x8 samples per cell, gives exact material ids,
// and runs in Vitest, so the determinism criteria are tested on real output.
//
// Compositing follows the original: gray strokes alpha-blend over paper,
// white fills erase what is behind them. Each primitive covers each sample at
// most once, so self-overlapping outlines do not double their alpha the way
// they would if drawn segment by segment.

import type { Primitive } from '../world/primitives';

export interface Raster {
  /** Samples across and down. */
  w: number;
  h: number;
  /** World position of sample (0,0)'s top-left corner, and sample spacing. */
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** Darkness 0..1. */
  ink: Float32Array;
  /** Accumulated opacity 0..1 (how much paper is laid over what is behind). */
  opa: Float32Array;
  /** Top-most material id. */
  mat: Uint8Array;
  /** Depth of the top-most mostly-opaque primitive (-Infinity where none). */
  depth: Float32Array;
  /** Structural line coverage 0..1 (ridges, banks, trunks), hidden by what is drawn over it. */
  line: Float32Array;
  /** Direction of that line at the sample, radians folded to [0, pi), screen y down. */
  lineAng: Float32Array;
}

/** Below this alpha a primitive does not claim the sample's material. */
const MATERIAL_ALPHA = 0.15;
/** At or above this alpha a primitive sets the sample's occlusion depth. */
const DEPTH_ALPHA = 0.5;

export function rasterize(prims: Primitive[], x0: number, y0: number, w: number, h: number, dx: number, dy: number): Raster {
  const n = w * h;
  const r: Raster = {
    w,
    h,
    x0,
    y0,
    dx,
    dy,
    ink: new Float32Array(n),
    opa: new Float32Array(n),
    mat: new Uint8Array(n),
    depth: new Float32Array(n).fill(-Infinity),
    line: new Float32Array(n),
    lineAng: new Float32Array(n),
  };
  const cov = new Float32Array(n);
  let touched = new Int32Array(4096);
  let nt = 0;
  const touch = (idx: number, c: number) => {
    const prev = cov[idx];
    if (prev === 0) {
      if (nt === touched.length) {
        const t2 = new Int32Array(touched.length * 2);
        t2.set(touched);
        touched = t2;
      }
      touched[nt++] = idx;
    }
    if (c > prev) cov[idx] = c;
  };

  const xmax = x0 + w * dx;
  const ymax = y0 + h * dy;
  const sp = (dx + dy) / 2;

  for (const p of prims) {
    const pts = p.points;
    const np = pts.length >> 1;
    if (np < 2) continue;
    // Bounding box, padded by the stroke half-width.
    let bx0 = Infinity,
      by0 = Infinity,
      bx1 = -Infinity,
      by1 = -Infinity;
    for (let k = 0; k < pts.length; k += 2) {
      const x = pts[k],
        y = pts[k + 1];
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
    const pad = p.width / 2 + sp;
    if (bx1 + pad < x0 || bx0 - pad > xmax || by1 + pad < y0 || by0 - pad > ymax) continue;

    if (p.kind === 'line') {
      lineSegments(pts, p.width, p.alpha, r, sp);
      continue;
    }
    nt = 0;
    if (p.kind === 'fill' && np >= 3) fillSpans(pts, r, touch);
    if (p.width > 0 || p.kind === 'stroke') {
      const closed = p.kind === 'fill';
      strokeSegments(pts, closed, Math.max(p.width, 0.01), r, sp, touch);
    }

    const occludes = p.kind === 'fill' && (p.ink < 0.15 || p.alpha >= 0.5);
    const ink = p.ink,
      alpha = p.alpha,
      mat = p.material,
      depth = p.depth;
    for (let t = 0; t < nt; t++) {
      const idx = touched[t];
      const a = alpha * cov[idx];
      cov[idx] = 0;
      if (a <= 0) continue;
      r.ink[idx] = r.ink[idx] * (1 - a) + ink * a;
      r.opa[idx] = r.opa[idx] + a * (1 - r.opa[idx]);
      if (a >= MATERIAL_ALPHA) r.mat[idx] = mat;
      if (a >= DEPTH_ALPHA) r.depth[idx] = depth;
      // Paper-coloured fills and dense ink cover the lines beneath them.
      if (occludes) r.line[idx] *= 1 - a;
    }
  }
  return r;
}

// Scratch for the scanline filler, grown as needed.
let edgeBuf = new Float64Array(5 * 256);
let order = new Int32Array(256);
let active = new Int32Array(256);
let xsBuf = new Float64Array(256);
let dirBuf = new Int8Array(256);

/**
 * Nonzero-winding polygon fill at sample centres (SVG's default fill rule),
 * with an active edge table: edges sorted by top row join the active list as
 * the scan reaches them and leave when it passes their bottom.
 */
function fillSpans(pts: Float32Array, r: Raster, touch: (idx: number, c: number) => void): void {
  const np = pts.length >> 1;
  if (edgeBuf.length < np * 5) {
    edgeBuf = new Float64Array(np * 10);
    order = new Int32Array(np * 2);
    active = new Int32Array(np * 2);
    xsBuf = new Float64Array(np * 2);
    dirBuf = new Int8Array(np * 2);
  }
  // Edges in sample space (sample centres at integer coordinates):
  // [ytop, ybot, x at ytop, dx/dy, dir]
  let ne = 0;
  let jmin = Infinity,
    jmax = -Infinity;
  const ix = 1 / r.dx,
    iy = 1 / r.dy;
  for (let k = 0; k < np; k++) {
    const k2 = k + 1 === np ? 0 : k + 1;
    const ax = (pts[k * 2] - r.x0) * ix - 0.5;
    const ay = (pts[k * 2 + 1] - r.y0) * iy - 0.5;
    const bx = (pts[k2 * 2] - r.x0) * ix - 0.5;
    const by = (pts[k2 * 2 + 1] - r.y0) * iy - 0.5;
    if (ay === by || !(ay === ay && by === by && ax === ax && bx === bx)) continue;
    const down = by > ay;
    const ytop = down ? ay : by;
    const ybot = down ? by : ay;
    // Edges entirely between two sample rows never cross one.
    if (Math.ceil(ytop) >= Math.ceil(ybot)) continue;
    const e = ne * 5;
    edgeBuf[e] = ytop;
    edgeBuf[e + 1] = ybot;
    edgeBuf[e + 2] = down ? ax : bx;
    edgeBuf[e + 3] = (bx - ax) / (by - ay);
    edgeBuf[e + 4] = down ? 1 : -1;
    order[ne] = ne;
    ne++;
    if (ytop < jmin) jmin = ytop;
    if (ybot > jmax) jmax = ybot;
  }
  if (ne < 2) return;
  const j0 = Math.max(0, Math.ceil(jmin));
  const j1 = Math.min(r.h - 1, Math.ceil(jmax) - 1);
  if (j0 > j1) return;
  // Sort edge indices by top (insertion sort; polygons are small).
  for (let a = 1; a < ne; a++) {
    const v = order[a];
    const key = edgeBuf[v * 5];
    let b = a - 1;
    while (b >= 0 && edgeBuf[order[b] * 5] > key) {
      order[b + 1] = order[b];
      b--;
    }
    order[b + 1] = v;
  }
  let next = 0;
  let na = 0;
  // Skip edges that end above the first visible row.
  for (let j = j0; j <= j1; j++) {
    while (next < ne && edgeBuf[order[next] * 5] <= j) active[na++] = order[next++];
    // Crossings of this row (half-open [ytop, ybot) avoids double hits at vertices).
    let nc = 0;
    let w = 0;
    for (let q = 0; q < na; q++) {
      const e = active[q] * 5;
      if (edgeBuf[e + 1] <= j) continue; // finished: drop
      active[w++] = active[q];
      const x = edgeBuf[e + 2] + (j - edgeBuf[e]) * edgeBuf[e + 3];
      let z = nc++;
      while (z > 0 && xsBuf[z - 1] > x) {
        xsBuf[z] = xsBuf[z - 1];
        dirBuf[z] = dirBuf[z - 1];
        z--;
      }
      xsBuf[z] = x;
      dirBuf[z] = edgeBuf[e + 4];
    }
    na = w;
    let wind = 0;
    const row = j * r.w;
    for (let q = 0; q < nc - 1; q++) {
      wind += dirBuf[q];
      if (wind !== 0) {
        const i0 = Math.max(0, Math.ceil(xsBuf[q]));
        const i1 = Math.min(r.w - 1, Math.ceil(xsBuf[q + 1]) - 1);
        for (let i = i0; i <= i1; i++) touch(row + i, 1);
      }
    }
  }
}

/** Anti-aliased thick polyline: box-filtered coverage by distance to each segment. */
function strokeSegments(pts: Float32Array, closed: boolean, width: number, r: Raster, sp: number, touch: (idx: number, c: number) => void): void {
  const np = pts.length >> 1;
  const half = width / 2;
  const reach = half + sp / 2;
  const segs = closed ? np : np - 1;
  for (let k = 0; k < segs; k++) {
    const k2 = (k + 1) % np;
    const ax = pts[k * 2],
      ay = pts[k * 2 + 1],
      bx = pts[k2 * 2],
      by = pts[k2 * 2 + 1];
    if (!(Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(bx) && Number.isFinite(by))) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - r.x0) / r.dx));
    const i1 = Math.min(r.w - 1, Math.floor((Math.max(ax, bx) + reach - r.x0) / r.dx));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - r.y0) / r.dy));
    const j1 = Math.min(r.h - 1, Math.floor((Math.max(ay, by) + reach - r.y0) / r.dy));
    if (i0 > i1 || j0 > j1) continue;
    const vx = bx - ax,
      vy = by - ay;
    const vv = vx * vx + vy * vy;
    for (let j = j0; j <= j1; j++) {
      const sy = r.y0 + (j + 0.5) * r.dy;
      const row = j * r.w;
      for (let i = i0; i <= i1; i++) {
        const sx = r.x0 + (i + 0.5) * r.dx;
        let t = vv > 0 ? ((sx - ax) * vx + (sy - ay) * vy) / vv : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + t * vx - sx,
          ey = ay + t * vy - sy;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d >= reach) continue;
        const c = (reach - d) / sp;
        touch(row + i, c > 1 ? 1 : c);
      }
    }
  }
}

/** Centreline coverage into the line map, keeping the direction of the strongest segment. */
function lineSegments(pts: Float32Array, width: number, weight: number, r: Raster, sp: number): void {
  const np = pts.length >> 1;
  const reach = width / 2 + sp / 2;
  for (let k = 0; k < np - 1; k++) {
    const ax = pts[k * 2],
      ay = pts[k * 2 + 1],
      bx = pts[k * 2 + 2],
      by = pts[k * 2 + 3];
    if (!(Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(bx) && Number.isFinite(by))) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - r.x0) / r.dx));
    const i1 = Math.min(r.w - 1, Math.floor((Math.max(ax, bx) + reach - r.x0) / r.dx));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - r.y0) / r.dy));
    const j1 = Math.min(r.h - 1, Math.floor((Math.max(ay, by) + reach - r.y0) / r.dy));
    if (i0 > i1 || j0 > j1) continue;
    const vx = bx - ax,
      vy = by - ay;
    const vv = vx * vx + vy * vy;
    if (vv === 0) continue;
    let ang = Math.atan2(-vy, vx);
    if (ang < 0) ang += Math.PI;
    if (ang >= Math.PI) ang -= Math.PI;
    for (let j = j0; j <= j1; j++) {
      const sy = r.y0 + (j + 0.5) * r.dy;
      const row = j * r.w;
      for (let i = i0; i <= i1; i++) {
        const sx = r.x0 + (i + 0.5) * r.dx;
        let t = ((sx - ax) * vx + (sy - ay) * vy) / vv;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + t * vx - sx,
          ey = ay + t * vy - sy;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d >= reach) continue;
        const c = Math.min(1, (reach - d) / sp) * weight;
        const idx = row + i;
        if (c > r.line[idx]) {
          r.line[idx] = c;
          r.lineAng[idx] = ang;
        }
      }
    }
  }
}
