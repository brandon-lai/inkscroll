// Mount.foot and Mount.mountain from the original: a layered peak with
// outline, foot strokes, hatching, and self-vegetation (trees on the rim, top,
// middle and base; houses, pagodas and rocks at the foot).

import { asLine, asMat, emitSprite, poly, type Pt, stroke, texture } from '../draw';
import { noise } from '../noise';
import { type Col, rgba, WHITE } from '../primitives';
import { normRand, rand, randChoice } from '../rng';
import { worldOptions } from '../options';
import { arch02, arch03, arch04, transmissionTower01 } from './arch';
import { rock } from './rock';
import { tree01, tree02, tree03 } from './trees';

/** Mount.foot: short strokes and white patches along the mountain's base. */
function foot(ptlist: Pt[][], args: { xof?: number; yof?: number } = {}): void {
  const xof = args.xof ?? 0;
  const yof = args.yof ?? 0;
  const ftlist: Pt[][] = [];
  const span = 10;
  let ni = 0;
  for (let i = 0; i < ptlist.length - 2; i += 1) {
    if (i == ni) {
      ni = Math.min(ni + randChoice([1, 2]), ptlist.length - 1);
      ftlist.push([]);
      ftlist.push([]);
      for (let j = 0; j < Math.min(ptlist[i].length / 8, 10); j++) {
        ftlist[ftlist.length - 2].push([ptlist[i][j][0] + noise(j * 0.1, i) * 10, ptlist[i][j][1]]);
        ftlist[ftlist.length - 1].push([ptlist[i][ptlist[i].length - 1 - j][0] - noise(j * 0.1, i) * 10, ptlist[i][ptlist[i].length - 1 - j][1]]);
      }
      ftlist[ftlist.length - 2] = ftlist[ftlist.length - 2].reverse();
      ftlist[ftlist.length - 1] = ftlist[ftlist.length - 1].reverse();
      for (let j = 0; j < span; j++) {
        const p = j / span;
        const x1 = ptlist[i][0][0] * (1 - p) + ptlist[ni][0][0] * p;
        let y1 = ptlist[i][0][1] * (1 - p) + ptlist[ni][0][1] * p;
        const x2 = ptlist[i][ptlist[i].length - 1][0] * (1 - p) + ptlist[ni][ptlist[i].length - 1][0] * p;
        let y2 = ptlist[i][ptlist[i].length - 1][1] * (1 - p) + ptlist[ni][ptlist[i].length - 1][1] * p;
        const vib = -1.7 * (p - 1) * Math.pow(p, 1 / 5);
        y1 += vib * 5 + noise(xof * 0.05, i) * 5;
        y2 += vib * 5 + noise(xof * 0.05, i) * 5;
        ftlist[ftlist.length - 2].push([x1, y1]);
        ftlist[ftlist.length - 1].push([x2, y2]);
      }
    }
  }
  for (const f of ftlist) poly(f, { xof, yof, fil: WHITE, str: null });
  for (const f of ftlist) {
    stroke(
      f.map((x) => [x[0] + xof, x[1] + yof] as Pt),
      { col: rgba(100, +(0.1 + rand() * 0.1).toFixed(3)), wid: 1 },
    );
  }
}

/** Mount.mountain */
export function mountain(xoff: number, yoff: number, seed: number, args: { hei?: number; wid?: number; tex?: number; veg?: boolean; col?: (x: number) => Col } = {}): void {
  const hei = args.hei ?? 100 + rand() * 400;
  const wid = args.wid ?? 400 + rand() * 200;
  const tex = args.tex ?? 200;
  const veg = args.veg ?? true;
  const col = args.col;

  const ptlist: Pt[][] = [];
  const h = hei;
  const w = wid;
  const reso = [10, 50];
  let hoff = 0;
  for (let j = 0; j < reso[0]; j++) {
    hoff += (rand() * yoff) / 100;
    ptlist.push([]);
    for (let i = 0; i < reso[1]; i++) {
      const x = (i / reso[1] - 0.5) * Math.PI;
      let y = Math.cos(x);
      y *= noise(x + 10, j * 0.15, seed);
      const p = 1 - j / reso[0];
      ptlist[ptlist.length - 1].push([(x / Math.PI) * w * p, -y * h * p + hoff]);
    }
  }

  function vegetate(treeFunc: (x: number, y: number) => void, growthRule: (i: number, j: number) => boolean, proofRule: (veglist: Pt[], i: number) => boolean): void {
    const veglist: Pt[] = [];
    for (let i = 0; i < ptlist.length; i += 1) {
      for (let j = 0; j < ptlist[i].length; j += 1) {
        if (growthRule(i, j)) veglist.push([ptlist[i][j][0], ptlist[i][j][1]]);
      }
    }
    for (let i = 0; i < veglist.length; i++) {
      if (proofRule(veglist, i)) treeFunc(veglist[i][0], veglist[i][1]);
    }
  }

  // RIM
  asMat('foliage', () =>
    vegetate(
      (x, y) => tree02(x + xoff, y + yoff - 5, { col: rgba(100, +(noise(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.5).toFixed(3)), clu: 2 }),
      (i, j) => {
        const ns = noise(j * 0.1, seed);
        return i == 0 && ns * ns * ns < 0.1 && Math.abs(ptlist[i][j][1]) / h > 0.2;
      },
      () => true,
    ),
  );

  // WHITE BG
  poly(ptlist[0].concat([[0, reso[0] * 4]]), { xof: xoff, yof: yoff, fil: WHITE, str: null });
  // OUTLINE (also the ridgeline in the line map)
  asLine(1, () =>
    stroke(
      ptlist[0].map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
      { col: rgba(100, 0.3), noi: 1, wid: 3 },
    ),
  );
  foot(ptlist, { xof: xoff, yof: yoff });
  texture(ptlist, { xof: xoff, yof: yoff, tex, sha: randChoice([0, 0, 0, 0, 5]), col });

  // TOP
  asMat('foliage', () =>
    vegetate(
      (x, y) => tree02(x + xoff, y + yoff, { col: rgba(100, +(noise(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.5).toFixed(3)) }),
      (i, j) => {
        const ns = noise(i * 0.1, j * 0.1, seed + 2);
        return ns * ns * ns < 0.1 && Math.abs(ptlist[i][j][1]) / h > 0.5;
      },
      () => true,
    ),
  );

  if (veg) {
    // MIDDLE
    asMat('foliage', () =>
      vegetate(
        (x, y) => {
          let ht = ((h + y) / h) * 70;
          ht = ht * 0.3 + rand() * ht * 0.7;
          tree01(x + xoff, y + yoff, { hei: ht, wid: rand() * 3 + 1, col: rgba(100, +(noise(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.3).toFixed(3)) });
        },
        (i, j) => {
          const ns = noise(i * 0.2, j * 0.05, seed);
          return j % 2 == 1 && ns * ns * ns * ns < 0.012 && Math.abs(ptlist[i][j][1]) / h < 0.3;
        },
        (veglist, i) => {
          let counter = 0;
          for (let j = 0; j < veglist.length; j++) {
            if (i != j && Math.pow(veglist[i][0] - veglist[j][0], 2) + Math.pow(veglist[i][1] - veglist[j][1], 2) < 30 * 30) counter++;
            if (counter > 2) return true;
          }
          return false;
        },
      ),
    );

    // BOTTOM
    asMat('foliage', () =>
      vegetate(
        (x, y) => {
          let ht = ((h + y) / h) * 120;
          ht = ht * 0.5 + rand() * ht * 0.5;
          const bc = rand() * 0.1;
          const bp = 1;
          tree03(x + xoff, y + yoff, { hei: ht, ben: (x) => Math.pow(x * bc, bp), col: rgba(100, +(noise(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.3).toFixed(3)) });
        },
        (i, j) => {
          const ns = noise(i * 0.2, j * 0.05, seed);
          return (j == 0 || j == ptlist[i].length - 1) && ns * ns * ns * ns < 0.012;
        },
        () => true,
      ),
    );
  }

  // BOTT ARCH
  asMat('architecture', () =>
    vegetate(
      (x, y) => {
        const tt = randChoice([0, 0, 1, 1, 1, 2]);
        if (tt == 1) {
          arch02(x + xoff, y + yoff, seed, { wid: normRand(40, 70), sto: randChoice([1, 2, 2, 3]), rot: rand(), sty: randChoice([1, 2, 3]) });
        } else if (tt == 2) {
          arch04(x + xoff, y + yoff, seed, { sto: randChoice([1, 1, 1, 2, 2]) });
        }
      },
      (i, j) => {
        const ns = noise(i * 0.2, j * 0.05, seed + 10);
        return i != 0 && (j == 1 || j == ptlist[i].length - 2) && ns * ns * ns * ns < 0.008;
      },
      () => true,
    ),
  );
  // TOP ARCH
  asMat('architecture', () =>
    vegetate(
      (x, y) => arch03(x + xoff, y + yoff, seed, { sto: randChoice([5, 7]), wid: 40 + rand() * 20 }),
      (i, j) => i == 1 && Math.abs(j - ptlist[i].length / 2) < 1 && rand() < 0.02,
      () => true,
    ),
  );
  // TRANSM
  asMat('architecture', () =>
    vegetate(
      (x, y) => transmissionTower01(x + xoff, y + yoff, seed),
      (i, j) => {
        const ns = noise(i * 0.2, j * 0.05, seed + 20 * Math.PI);
        return i % 2 == 0 && (j == 1 || j == ptlist[i].length - 2) && ns * ns * ns * ns < 0.002;
      },
      () => true,
    ),
  );
  // BOTT ROCK
  asMat('rock', () =>
    vegetate(
      (x, y) => rock(x + xoff, y + yoff, seed, { wid: 20 + rand() * 20, hei: 20 + rand() * 20, sha: 2 }),
      (i, j) => (j == 0 || j == ptlist[i].length - 1) && rand() < 0.1,
      () => true,
    ),
  );

  // Not in the original: some mountains carry a waterfall down their face,
  // from a point on an inner layer to the foot. Drawn last, so it never
  // shifts the random stream the original shapes use.
  if (rand() < worldOptions.waterfallChance) {
    const i = 1 + Math.floor(rand() * 3);
    const j = Math.floor(ptlist[i].length * (0.3 + rand() * 0.4));
    const [px, py] = ptlist[i][j];
    const drop = -py;
    if (drop > 60) emitSprite({ kind: 'waterfall', variant: Math.round(drop), x: xoff + px, y: yoff + py, flip: rand() < 0.5 });
  }
}
