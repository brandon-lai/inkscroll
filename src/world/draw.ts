// Drawing helpers from the original's Util / PolyTools / stroke / blob /
// texture, rewritten to push typed primitives into a sink instead of
// returning SVG strings. Logic and constants are the original's; the original
// function names are kept so the two can be read side by side.

import { noise } from './noise';
import { rand } from './rng';
import { type Col, type Primitive, type SpritePlacement, MAT, type MaterialId } from './primitives';

export type Pt = [number, number];

// --- the sink -------------------------------------------------------------------

interface Sink {
  prims: Primitive[];
  sprites: SpritePlacement[];
  material: number;
  depth: number;
  /** Weight of 'line' centrelines emitted alongside strokes (0 = none). */
  line: number;
}
let sink: Sink = { prims: [], sprites: [], material: 0, depth: 0, line: 0 };

/** Collect everything fn draws, tagged with a material and depth. */
export function collect(material: MaterialId, depth: number, fn: () => void): { prims: Primitive[]; sprites: SpritePlacement[] } {
  const prev = sink;
  sink = { prims: [], sprites: [], material: MAT[material], depth, line: 0 };
  try {
    fn();
    return { prims: sink.prims, sprites: sink.sprites };
  } finally {
    sink = prev;
  }
}

/** Draw fn's output with a different material (trees on a mountain, buildings, rocks). */
export function asMat<T>(material: MaterialId, fn: () => T): T {
  const prev = sink.material;
  sink.material = MAT[material];
  try {
    return fn();
  } finally {
    sink.material = prev;
  }
}

/** Strokes drawn inside fn also emit their centreline into the line map, at this weight. */
export function asLine<T>(weight: number, fn: () => T): T {
  const prev = sink.line;
  sink.line = weight;
  try {
    return fn();
  } finally {
    sink.line = prev;
  }
}

/** A centreline for the line map with no ink of its own. */
export function emitLine(plist: Pt[], xof = 0, yof = 0): void {
  if (sink.line <= 0 || plist.length < 2) return;
  sink.prims.push({ kind: 'line', points: pack(plist, xof, yof), ink: 0, alpha: sink.line, width: 1.4, material: sink.material, depth: sink.depth });
}

export function currentDepth(): number {
  return sink.depth;
}

export function emitSprite(s: Omit<SpritePlacement, 'depth'>): void {
  sink.sprites.push({ ...s, depth: sink.depth });
}

function pack(plist: Pt[], xof: number, yof: number): Float32Array {
  const a = new Float32Array(plist.length * 2);
  for (let i = 0; i < plist.length; i++) {
    const p = plist[i];
    // unNan: the original patches NaN coordinates in the SVG text; do it here.
    a[i * 2] = (p[0] || 0) + xof;
    a[i * 2 + 1] = (p[1] || 0) + yof;
  }
  return a;
}

const inkOf = (c: Col) => 1 - c.g / 255;

/**
 * poly: a polyline with optional fill and stroke. SVG fills a polyline as if
 * closed and strokes it open, so a fill and a separately coloured stroke
 * become two primitives; same-coloured fill+stroke becomes one outlined fill.
 */
export function poly(
  plist: Pt[],
  args: { xof?: number; yof?: number; fil?: Col | null; str?: Col | null; wid?: number } = {},
): void {
  if (plist.length < 2) return;
  const xof = args.xof ?? 0;
  const yof = args.yof ?? 0;
  const fil = args.fil ?? null;
  const str = args.str !== undefined ? args.str : fil;
  const wid = args.wid ?? 0;
  const pts = pack(plist, xof, yof);
  const sameColour = fil && str && fil.g === str.g && fil.a === str.a;
  if (fil && fil.a > 0) {
    sink.prims.push({
      kind: 'fill',
      points: pts,
      ink: inkOf(fil),
      alpha: fil.a,
      width: sameColour ? wid : 0,
      material: sink.material,
      depth: sink.depth,
    });
  }
  if (str && str.a > 0 && wid > 0 && !sameColour) {
    emitLine(plist, xof, yof);
    sink.prims.push({
      kind: 'stroke',
      points: pts,
      ink: inkOf(str),
      alpha: str.a,
      width: wid,
      material: sink.material,
      depth: sink.depth,
    });
  }
}

// --- Util -------------------------------------------------------------------------

export function distance(p0: Pt, p1: Pt): number {
  return Math.sqrt(Math.pow(p0[0] - p1[0], 2) + Math.pow(p0[1] - p1[1], 2));
}

export function loopNoise(nslist: number[]): void {
  const dif = nslist[nslist.length - 1] - nslist[0];
  const bds = [100, -100];
  for (let i = 0; i < nslist.length; i++) {
    nslist[i] += (dif * (nslist.length - 1 - i)) / (nslist.length - 1);
    if (nslist[i] < bds[0]) bds[0] = nslist[i];
    if (nslist[i] > bds[1]) bds[1] = nslist[i];
  }
  for (let i = 0; i < nslist.length; i++) {
    nslist[i] = (nslist[i] - bds[0]) / (bds[1] - bds[0]);
  }
}

/** PolyTools.midPt */
export function midPt(plist: Pt[]): Pt {
  let x = 0,
    y = 0;
  for (const v of plist) {
    x += v[0] / plist.length;
    y += v[1] / plist.length;
  }
  return [x, y];
}

/** div: subdivide a polyline so each segment becomes `reso` pieces. */
export function div(plist: Pt[], reso: number): Pt[] {
  const tl = (plist.length - 1) * reso;
  const rlist: Pt[] = [];
  for (let i = 0; i < tl; i += 1) {
    const lastp = plist[Math.floor(i / reso)];
    const nextp = plist[Math.ceil(i / reso)];
    const p = (i % reso) / reso;
    rlist.push([lastp[0] * (1 - p) + nextp[0] * p, lastp[1] * (1 - p) + nextp[1] * p]);
  }
  if (plist.length > 0) rlist.push([plist[plist.length - 1][0], plist[plist.length - 1][1]]);
  return rlist;
}

/** PolyTools.triangulate: ear clipping, then shatter into triangles under `area`. */
export function triangulate(plist: Pt[], args: { area?: number; convex?: boolean; optimize?: boolean } = {}): Pt[][] {
  const area = args.area ?? 100;
  const convex = args.convex ?? false;
  const optimize = args.optimize ?? true;

  function lineExpr(pt0: Pt, pt1: Pt): [number, number] {
    const den = pt1[0] - pt0[0];
    const m = den == 0 ? Infinity : (pt1[1] - pt0[1]) / den;
    const k = pt0[1] - m * pt0[0];
    return [m, k];
  }
  function intersect(ln0: [Pt, Pt], ln1: [Pt, Pt]): Pt | false {
    const le0 = lineExpr(ln0[0], ln0[1]);
    const le1 = lineExpr(ln1[0], ln1[1]);
    const den = le0[0] - le1[0];
    if (den == 0) return false;
    const x = (le1[1] - le0[1]) / den;
    const y = le0[0] * x + le0[1];
    const onSeg = (p: Pt, ln: [Pt, Pt]) =>
      Math.min(ln[0][0], ln[1][0]) <= p[0] &&
      p[0] <= Math.max(ln[0][0], ln[1][0]) &&
      Math.min(ln[0][1], ln[1][1]) <= p[1] &&
      p[1] <= Math.max(ln[0][1], ln[1][1]);
    if (onSeg([x, y], ln0) && onSeg([x, y], ln1)) return [x, y];
    return false;
  }
  function ptInPoly(pt: Pt, pl: Pt[]): boolean {
    let scount = 0;
    for (let i = 0; i < pl.length; i++) {
      const np = pl[i != pl.length - 1 ? i + 1 : 0];
      if (intersect([pl[i], np], [pt, [pt[0] + 999, pt[1] + 999]]) !== false) scount++;
    }
    return scount % 2 == 1;
  }
  function lnInPoly(ln: [Pt, Pt], pl: Pt[]): boolean {
    const ep = 0.01;
    const lnc: [Pt, Pt] = [
      [ln[0][0] * (1 - ep) + ln[1][0] * ep, ln[0][1] * (1 - ep) + ln[1][1] * ep],
      [ln[0][0] * ep + ln[1][0] * (1 - ep), ln[0][1] * ep + ln[1][1] * (1 - ep)],
    ];
    for (let i = 0; i < pl.length; i++) {
      const np = pl[i != pl.length - 1 ? i + 1 : 0];
      if (intersect(lnc, [pl[i], np]) !== false) return false;
    }
    return ptInPoly(midPt(ln), pl);
  }
  function sidesOf(pl: Pt[]): number[] {
    const slist: number[] = [];
    for (let i = 0; i < pl.length; i++) {
      const pt = pl[i];
      const np = pl[i != pl.length - 1 ? i + 1 : 0];
      slist.push(Math.sqrt(Math.pow(np[0] - pt[0], 2) + Math.pow(np[1] - pt[1], 2)));
    }
    return slist;
  }
  function areaOf(pl: Pt[]): number {
    const [a, b, c] = sidesOf(pl);
    const s = (a + b + c) / 2;
    return Math.sqrt(s * (s - a) * (s - b) * (s - c));
  }
  function sliverRatio(pl: Pt[]): number {
    return areaOf(pl) / sidesOf(pl).reduce((m, n) => m + n, 0);
  }
  function bestEar(pl: Pt[]): [Pt[], Pt[]] {
    const cuts: [Pt[], Pt[]][] = [];
    for (let i = 0; i < pl.length; i++) {
      const pt = pl[i];
      const lp = pl[i != 0 ? i - 1 : pl.length - 1];
      const np = pl[i != pl.length - 1 ? i + 1 : 0];
      const qlist = pl.slice();
      qlist.splice(i, 1);
      if (convex || lnInPoly([lp, np], pl)) {
        const c: [Pt[], Pt[]] = [[lp, pt, np], qlist];
        if (!optimize) return c;
        cuts.push(c);
      }
    }
    let best: [Pt[], Pt[]] = [pl, []];
    let bestRatio = 0;
    for (const c of cuts) {
      const r = sliverRatio(c[0]);
      if (r >= bestRatio) {
        best = c;
        bestRatio = r;
      }
    }
    return best;
  }
  function shatter(pl: Pt[], a: number, depth = 0): Pt[][] {
    if (pl.length == 0) return [];
    // The original recurses until every piece is under `area`; degenerate
    // triangles (NaN area) would recurse forever, so cap the depth.
    if (!(areaOf(pl) >= a) || depth > 12) return [pl];
    const slist = sidesOf(pl);
    const ind = slist.reduce((iMax, x, i, arr) => (x > arr[iMax] ? i : iMax), 0);
    const nind = (ind + 1) % pl.length;
    const lind = (ind + 2) % pl.length;
    const mid = midPt([pl[ind], pl[nind]]);
    return shatter([pl[ind], mid, pl[lind]], a, depth + 1).concat(shatter([pl[lind], pl[nind], mid], a, depth + 1));
  }
  // The original recurses once per ear; iterate instead so long outlines
  // cannot overflow the worker's stack.
  const out: Pt[][] = [];
  let rest = plist;
  while (rest.length > 3) {
    const cut = bestEar(rest);
    if (cut[1].length === 0) {
      rest = cut[0];
      break;
    }
    out.push(...shatter(cut[0], area));
    rest = cut[1];
  }
  out.push(...shatter(rest, area));
  return out;
}

// --- strokes and blobs ---------------------------------------------------------------

/** stroke: a brush stroke along a polyline, width shaped by `fun`, jittered by noise. */
export function stroke(
  ptlist: Pt[],
  args: { xof?: number; yof?: number; wid?: number; col?: Col; noi?: number; out?: number; fun?: (x: number) => number } = {},
): void {
  const xof = args.xof ?? 0;
  const yof = args.yof ?? 0;
  const wid = args.wid ?? 2;
  const col = args.col ?? { g: 200, a: 0.9 };
  const noi = args.noi ?? 0.5;
  const out = args.out ?? 1;
  const fun = args.fun ?? ((x: number) => Math.sin(x * Math.PI));

  if (ptlist.length == 0) return;
  const vtxlist0: Pt[] = [];
  const vtxlist1: Pt[] = [];
  const n0 = rand() * 10;
  for (let i = 1; i < ptlist.length - 1; i++) {
    let w = wid * fun(i / ptlist.length);
    w = w * (1 - noi) + w * noi * noise(i * 0.5, n0);
    const a1 = Math.atan2(ptlist[i][1] - ptlist[i - 1][1], ptlist[i][0] - ptlist[i - 1][0]);
    const a2 = Math.atan2(ptlist[i][1] - ptlist[i + 1][1], ptlist[i][0] - ptlist[i + 1][0]);
    let a = (a1 + a2) / 2;
    if (a < a2) a += Math.PI;
    vtxlist0.push([ptlist[i][0] + w * Math.cos(a), ptlist[i][1] + w * Math.sin(a)]);
    vtxlist1.push([ptlist[i][0] - w * Math.cos(a), ptlist[i][1] - w * Math.sin(a)]);
  }
  const vtxlist = ([ptlist[0]] as Pt[])
    .concat(vtxlist0.concat(vtxlist1.concat([ptlist[ptlist.length - 1]]).reverse()))
    .concat([ptlist[0]]);
  poly(
    vtxlist.map((x) => [x[0] + xof, x[1] + yof] as Pt),
    { fil: col, str: col, wid: out },
  );
  emitLine(ptlist, xof, yof);
}

const defaultBlobFun = (x: number) =>
  x <= 1 ? Math.pow(Math.sin(x * Math.PI), 0.5) : -Math.pow(Math.sin((x + 1) * Math.PI), 0.5);

/** blob: a leaf- or dab-shaped filled outline. ret=1 returns the points instead of drawing. */
export function blob(
  x: number,
  y: number,
  args: { len?: number; wid?: number; ang?: number; col?: Col; noi?: number; ret?: number; fun?: (x: number) => number } = {},
): Pt[] {
  const len = args.len ?? 20;
  const wid = args.wid ?? 5;
  const ang = args.ang ?? 0;
  const col = args.col ?? { g: 200, a: 0.9 };
  const noi = args.noi ?? 0.5;
  const ret = args.ret ?? 0;
  const fun = args.fun ?? defaultBlobFun;

  const reso = 20.0;
  const lalist: [number, number][] = [];
  for (let i = 0; i < reso + 1; i++) {
    const p = (i / reso) * 2;
    const xo = len / 2 - Math.abs(p - 1) * len;
    const yo = (fun(p) * wid) / 2;
    lalist.push([Math.sqrt(xo * xo + yo * yo), Math.atan2(yo, xo)]);
  }
  const nslist: number[] = [];
  const n0 = rand() * 10;
  for (let i = 0; i < reso + 1; i++) nslist.push(noise(i * 0.05, n0));
  loopNoise(nslist);
  const plist: Pt[] = [];
  for (let i = 0; i < lalist.length; i++) {
    const ns = nslist[i] * noi + (1 - noi);
    plist.push([x + Math.cos(lalist[i][1] + ang) * lalist[i][0] * ns, y + Math.sin(lalist[i][1] + ang) * lalist[i][0] * ns]);
  }
  if (ret == 0) poly(plist, { fil: col, str: col, wid: 0 });
  return plist;
}

/** texture: hatching strokes laid across the layers of a shape (ptlist[layer][point]). */
export function texture(
  ptlist: Pt[][],
  args: {
    xof?: number;
    yof?: number;
    tex?: number;
    wid?: number;
    len?: number;
    sha?: number;
    ret?: number;
    noi?: (x: number) => number;
    col?: (x: number) => Col;
    dis?: () => number;
  } = {},
): Pt[][] {
  const xof = args.xof ?? 0;
  const yof = args.yof ?? 0;
  const tex = args.tex ?? 400;
  const wid = args.wid ?? 1.5;
  const len = args.len ?? 0.2;
  const sha = args.sha ?? 0;
  const ret = args.ret ?? 0;
  const noi = args.noi ?? ((x: number) => 30 / x);
  const col = args.col ?? (() => ({ g: 100, a: +(rand() * 0.3).toFixed(3) }));
  const dis =
    args.dis ??
    (() => {
      if (rand() > 0.5) return (1 / 3) * rand();
      return (1 * 2) / 3 + (1 / 3) * rand();
    });
  const reso = [ptlist.length, ptlist[0].length];
  const texlist: Pt[][] = [];
  for (let i = 0; i < tex; i++) {
    const mid = (dis() * reso[1]) | 0;
    const hlen = Math.floor(rand() * (reso[1] * len));
    const start = Math.min(Math.max(mid - hlen, 0), reso[1]);
    const end = Math.min(Math.max(mid + hlen, 0), reso[1]);
    const layer = (i / tex) * (reso[0] - 1);
    const t: Pt[] = [];
    for (let j = start; j < end; j++) {
      const p = layer - Math.floor(layer);
      const x = ptlist[Math.floor(layer)][j][0] * p + ptlist[Math.ceil(layer)][j][0] * (1 - p);
      const y = ptlist[Math.floor(layer)][j][1] * p + ptlist[Math.ceil(layer)][j][1] * (1 - p);
      t.push([x + noi(layer + 1) * (noise(x, j * 0.5) - 0.5), y + noi(layer + 1) * (noise(y, j * 0.5) - 0.5)]);
    }
    texlist.push(t);
  }
  if (ret) return texlist;
  // SHADE
  if (sha) {
    for (let j = 0; j < texlist.length; j += 1 + (sha != 0 ? 1 : 0)) {
      stroke(
        texlist[j].map((x) => [x[0] + xof, x[1] + yof] as Pt),
        { col: { g: 100, a: 0.1 }, wid: sha },
      );
    }
  }
  // TEXTURE
  for (let j = 0 + sha; j < texlist.length; j += 1 + sha) {
    stroke(
      texlist[j].map((x) => [x[0] + xof, x[1] + yof] as Pt),
      { col: col(j / texlist.length), wid },
    );
  }
  return texlist;
}

/**
 * The original often builds a part (bark, twigs, leaf blobs) as a string while
 * walking a trunk and appends it after the trunk outline. `capture` runs the
 * generator now, so the random sequence matches, and returns a function that
 * replays its primitives later, so the painter's order matches too.
 */
export function capture(fn: () => void): () => void {
  const prev = sink;
  const local: Sink = { prims: [], sprites: [], material: prev.material, depth: prev.depth, line: prev.line };
  sink = local;
  try {
    fn();
  } finally {
    sink = prev;
  }
  return () => {
    for (const p of local.prims) sink.prims.push(p);
    for (const s of local.sprites) sink.sprites.push(s);
  };
}
