// Port of mountplanner + chunkloader. The original plans one 512-unit strip
// at a time with a shared RNG and a global `planmtx` filled by whatever strips
// happened to be generated earlier, so the world depends on scroll history.
// Here a plan chunk's contents depend only on (seed, chunk index):
//   - mountains use the chunk's own stream;
//   - "is this ground already covered by a mountain" (planmtx) is computed from
//     the mountains of the chunks within reach on both sides, not from history;
//   - flat mounts and boats use their own streams.

import { chunkWidthUnits, type Config, config as liveConfig } from '../config';
import { collect } from './draw';
import { distMount } from './generators/distMount';
import { flatMount } from './generators/flatMount';
import { mountain } from './generators/mountain';
import { water } from './generators/water';
import { boat01 } from './generators/arch';
import { noise } from './noise';
import type { MaterialId, Primitive, SpritePlacement } from './primitives';
import { hash, rand, randChoice, sfc32, withRng } from './rng';

export type Tag = 'mount' | 'water' | 'flatmount' | 'boat' | 'distmount';
const TAG_CODE: Record<Tag, number> = { mount: 1, water: 2, flatmount: 3, boat: 4, distmount: 5 };

export interface Placement {
  tag: Tag;
  x: number;
  y: number;
  /** Painter's order (the original sorts chunks by y; water goes 10000 behind). */
  depth: number;
  /** Plan chunk that owns it, and its index in that chunk's plan. */
  chunk: number;
  idx: number;
  /** Conservative horizontal extent before generation, for picking candidates. */
  x0: number;
  x1: number;
}

export interface Element {
  placement: Placement;
  prims: Primitive[];
  sprites: SpritePlacement[];
  /** Actual horizontal extent of what was generated. */
  x0: number;
  x1: number;
}

const XSTEP = 5;
const MWID = 200;
/** Element reach beyond its anchor, for candidate selection. */
const REACH: Record<Tag, number> = { mount: 460, water: 470, flatmount: 680, boat: 140, distmount: 0 };

interface Reg {
  tag: Tag;
  x: number;
  y: number;
}

function chadd(reg: Reg[], r: Reg, mind = 10): boolean {
  for (const k of reg) if (Math.abs(k.x - r.x) < mind) return false;
  reg.push(r);
  return true;
}

const samp = 0.03;
const ns = (x: number) => Math.max(noise(x * samp) - 0.55, 0) * 2;
const yr = (x: number) => noise(x * 0.01, Math.PI);

/** locmax: the original ignores y in ns, so this is a 1-D local-maximum test. */
function locmax(x: number, r: number): boolean {
  const z0 = ns(x);
  if (z0 <= 0.3) return false;
  for (let i = x - r; i < x + r; i++) if (ns(i) > z0) return false;
  return true;
}

function stepsIn(c: number, cw: number): number[] {
  const out: number[] = [];
  for (let i = Math.ceil((c * cw) / XSTEP) * XSTEP; i < (c + 1) * cw; i += XSTEP) out.push(i);
  return out;
}

const mountMemo = new Map<string, Reg[]>();

/** The mountains a plan chunk places (the first loop of mountplanner). */
function mountsOf(seed: number, c: number, cw: number): Reg[] {
  const key = `${seed}:${c}:${cw}`;
  const hit = mountMemo.get(key);
  if (hit) return hit;
  const rng = sfc32(hash(seed, c, 1));
  const reg: Reg[] = [];
  for (const i of stepsIn(c, cw)) {
    const lim = yr(i) * 480;
    for (let j = 0; j < lim; j += 30) {
      if (locmax(i, 2)) {
        chadd(reg, { tag: 'mount', x: i + 2 * (rng() - 0.5) * 500, y: j + 300 });
      }
    }
  }
  if (mountMemo.size > 400) mountMemo.clear();
  mountMemo.set(key, reg);
  return reg;
}

const planMemo = new Map<string, Placement[]>();

/** Everything one foreground plan chunk places, in the original's order. */
export function planChunk(seed: number, c: number, cfg: Config = liveConfig): Placement[] {
  const cw = chunkWidthUnits(cfg);
  const key = `${seed}:${c}:${cw}`;
  const hit = planMemo.get(key);
  if (hit) return hit;

  const reg: Reg[] = mountsOf(seed, c, cw).slice();
  // planmtx: which XSTEP columns some mountain within reach covers.
  const covered = new Set<number>();
  for (let d = -2; d <= 2; d++) {
    for (const m of mountsOf(seed, c + d, cw)) {
      for (let k = Math.floor((m.x - MWID) / XSTEP); k < (m.x + MWID) / XSTEP; k++) covered.add(k);
    }
  }
  const rf = sfc32(hash(seed, c, 2));
  for (const i of stepsIn(c, cw)) {
    if (!covered.has(Math.floor(i / XSTEP)) && rf() < 0.01) {
      for (let j = 0; j < 4 * rf(); j++) chadd(reg, { tag: 'flatmount', x: i + 2 * (rf() - 0.5) * 700, y: 700 - j * 50 });
    }
  }
  const rb = sfc32(hash(seed, c, 3));
  for (const i of stepsIn(c, cw)) {
    if (rb() < 0.2) chadd(reg, { tag: 'boat', x: i, y: 300 + rb() * 390 }, 400);
  }

  const out: Placement[] = [];
  reg.forEach((r, idx) => {
    const base = { x: r.x, y: r.y, chunk: c, idx };
    out.push({ ...base, tag: r.tag, depth: r.y, x0: r.x - REACH[r.tag], x1: r.x + REACH[r.tag] });
    if (r.tag === 'mount') out.push({ ...base, tag: 'water', depth: r.y - 10000, x0: r.x - REACH.water, x1: r.x + REACH.water });
  });
  if (planMemo.size > 400) planMemo.clear();
  planMemo.set(key, out);
  return out;
}

/** Background plan chunk: a far range every 1000 units (distmount in mountplanner). */
export function planBackground(seed: number, c: number, cfg: Config = liveConfig): Placement[] {
  const cw = chunkWidthUnits(cfg);
  const out: Placement[] = [];
  for (let i = Math.ceil((c * cw) / 1000) * 1000; i < (c + 1) * cw; i += 1000) {
    const rng = sfc32(hash(seed, i, 7));
    const y = 280 - rng() * 50;
    out.push({ tag: 'distmount', x: i, y, depth: y, chunk: c, idx: i, x0: i - 10, x1: i + 1510 });
  }
  return out;
}

const MATERIAL: Record<Tag, MaterialId> = { mount: 'mountain', water: 'water', flatmount: 'mountain', boat: 'boat', distmount: 'farMountain' };

/** Generate one placement's geometry with its own random stream. */
export function generate(seed: number, p: Placement): Element {
  const got = withRng(hash(seed, p.chunk, p.idx, TAG_CODE[p.tag]), () =>
    collect(MATERIAL[p.tag], p.depth, () => {
      switch (p.tag) {
        case 'mount':
          mountain(p.x, p.y, p.idx * 2 * rand());
          break;
        case 'water':
          water(p.x, p.y, p.idx * 2);
          break;
        case 'flatmount':
          flatMount(p.x, p.y, 2 * rand() * Math.PI, { wid: 600 + rand() * 400, hei: 100, cho: 0.5 + rand() * 0.2 });
          break;
        case 'distmount':
          distMount(p.x, p.y, rand() * 100, { hei: 150, len: randChoice([500, 1000, 1500]) });
          break;
        case 'boat':
          boat01(p.x, p.y, rand(), { sca: p.y / 800, fli: randChoice([true, false]) });
          break;
      }
    }),
  );
  let x0 = Infinity,
    x1 = -Infinity,
    wmax = 0;
  for (const pr of got.prims) {
    const pts = pr.points;
    for (let k = 0; k < pts.length; k += 2) {
      if (pts[k] < x0) x0 = pts[k];
      if (pts[k] > x1) x1 = pts[k];
    }
    if (pr.width > wmax) wmax = pr.width;
  }
  x0 -= wmax;
  x1 += wmax;
  for (const s of got.sprites) {
    x0 = Math.min(x0, s.x - 80);
    x1 = Math.max(x1, s.x + 80);
  }
  return { placement: p, prims: got.prims, sprites: got.sprites, x0, x1 };
}

/** How many plan chunks either side can reach into a given chunk. */
export const PLAN_REACH = 3;
