// Mount.flatMount and Mount.flatDec from the original: a low plateau or bank
// with a flat top, decorated with rocks, groves, and sometimes a pavilion.

import { asLine, asMat, div, poly, type Pt, stroke, texture } from '../draw';
import { noise } from '../noise';
import { rgba, WHITE } from '../primitives';
import { normRand, rand, randChoice } from '../rng';
import { arch01 } from './arch';
import { rock } from './rock';
import { tree02, tree04, tree05, tree06, tree07, tree08 } from './trees';

export function flatMount(xoff: number, yoff: number, seed: number, args: { hei?: number; wid?: number; tex?: number; cho?: number } = {}): void {
  const hei = args.hei ?? 40 + rand() * 400;
  const wid = args.wid ?? 400 + rand() * 200;
  const tex = args.tex ?? 80;
  const cho = args.cho ?? 0.5;

  const ptlist: Pt[][] = [];
  const reso = [5, 50];
  let hoff = 0;
  const flat: Pt[][] = [];
  for (let j = 0; j < reso[0]; j++) {
    hoff += (rand() * yoff) / 100;
    ptlist.push([]);
    flat.push([]);
    for (let i = 0; i < reso[1]; i++) {
      const x = (i / reso[1] - 0.5) * Math.PI;
      let y = Math.cos(x * 2) + 1;
      y *= noise(x + 10, j * 0.1, seed);
      const p = 1 - (j / reso[0]) * 0.6;
      const nx = (x / Math.PI) * wid * p;
      let ny = -y * hei * p + hoff;
      const h = 100;
      if (ny < -h * cho + hoff) {
        ny = -h * cho + hoff;
        if (flat[flat.length - 1].length % 2 == 0) flat[flat.length - 1].push([nx, ny]);
      } else if (flat[flat.length - 1].length % 2 == 1) {
        const last = ptlist[ptlist.length - 1][ptlist[ptlist.length - 1].length - 1];
        flat[flat.length - 1].push([last[0], last[1]]);
      }
      ptlist[ptlist.length - 1].push([nx, ny]);
    }
  }

  // WHITE BG
  poly(ptlist[0].concat([[0, reso[0] * 4]]), { xof: xoff, yof: yoff, fil: WHITE, str: null });
  // OUTLINE (also the ridgeline in the line map)
  asLine(1, () =>
    stroke(
      ptlist[0].map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
      { col: rgba(100, 0.3), noi: 1, wid: 3 },
    ),
  );
  texture(ptlist, { xof: xoff, yof: yoff, tex, wid: 2, dis: () => (rand() > 0.5 ? 0.1 + 0.4 * rand() : 0.9 - 0.4 * rand()) });

  let grlist1: Pt[] = [];
  let grlist2: Pt[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    if (flat[i].length >= 2) {
      grlist1.push(flat[i][0]);
      grlist2.push(flat[i][flat[i].length - 1]);
    }
  }
  if (grlist1.length == 0) return;
  let wb = [grlist1[0][0], grlist2[0][0]];
  for (let i = 0; i < 3; i++) {
    const p = 0.8 - i * 0.2;
    grlist1.unshift([wb[0] * p, grlist1[0][1] - 5]);
    grlist2.unshift([wb[1] * p, grlist2[0][1] - 5]);
  }
  wb = [grlist1[grlist1.length - 1][0], grlist2[grlist2.length - 1][0]];
  for (let i = 0; i < 3; i++) {
    const p = 0.6 - i * i * 0.1;
    grlist1.push([wb[0] * p, grlist1[grlist1.length - 1][1] + 1]);
    grlist2.push([wb[1] * p, grlist2[grlist2.length - 1][1] + 1]);
  }
  const d = 5;
  grlist1 = div(grlist1, d);
  grlist2 = div(grlist2, d);
  const grlist = grlist1.reverse().concat(grlist2.concat([grlist1[0]]));
  for (let i = 0; i < grlist.length; i++) {
    const v = (1 - Math.abs((i % d) - d / 2) / (d / 2)) * 0.12;
    grlist[i] = [grlist[i][0] * (1 - v + noise(grlist[i][1] * 0.5) * v), grlist[i][1]];
  }
  poly(grlist, { xof: xoff, yof: yoff, str: null, fil: WHITE, wid: 2 });
  asLine(0.8, () =>
    stroke(
      grlist.map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
      { wid: 3, col: rgba(100, 0.2) },
    ),
  );

  let xmin = Infinity,
    xmax = -Infinity,
    ymin = Infinity,
    ymax = -Infinity;
  for (const p of grlist) {
    xmin = Math.min(xmin, p[0]);
    xmax = Math.max(xmax, p[0]);
    ymin = Math.min(ymin, p[1]);
    ymax = Math.max(ymax, p[1]);
  }
  flatDec(xoff, yoff, { xmin, xmax, ymin, ymax });
}

export function flatDec(xoff: number, yoff: number, grbd: { xmin: number; xmax: number; ymin: number; ymax: number }): void {
  const tt = randChoice([0, 0, 1, 2, 3, 4]);
  const ymid = (grbd.ymin + grbd.ymax) / 2;

  asMat('rock', () => {
    for (let j = 0; j < rand() * 5; j++) {
      rock(xoff + normRand(grbd.xmin, grbd.xmax), yoff + ymid + normRand(-10, 10) + 10, rand() * 100, { wid: 10 + rand() * 20, hei: 10 + rand() * 20, sha: 2 });
    }
  });
  asMat('trunk', () => {
    for (let j = 0; j < randChoice([0, 0, 1, 2]); j++) {
      const xr = xoff + normRand(grbd.xmin, grbd.xmax);
      const yr = yoff + ymid + normRand(-5, 5) + 20;
      for (let k = 0; k < 2 + rand() * 3; k++) {
        tree08(xr + Math.min(Math.max(normRand(-30, 30), grbd.xmin), grbd.xmax), yr, { hei: 60 + rand() * 40 });
      }
    }
  });

  const bigRock = (x: number, y: number, s: number) => asMat('rock', () => rock(x, y, s, { wid: 50 + rand() * 20, hei: 40 + rand() * 20, sha: 5 }));

  if (tt == 0) {
    for (let j = 0; j < rand() * 3; j++) bigRock(xoff + normRand(grbd.xmin, grbd.xmax), yoff + ymid + normRand(-5, 5) + 20, rand() * 100);
  }
  if (tt == 1) {
    const pmin = rand() * 0.5;
    const pmax = rand() * 0.5 + 0.5;
    const xmin = grbd.xmin * (1 - pmin) + grbd.xmax * pmin;
    const xmax = grbd.xmin * (1 - pmax) + grbd.xmax * pmax;
    for (let i = xmin; i < xmax; i += 30) tree05(xoff + i + 20 * normRand(-1, 1), yoff + ymid + 20, { hei: 100 + rand() * 200 });
    for (let j = 0; j < rand() * 4; j++) bigRock(xoff + normRand(grbd.xmin, grbd.xmax), yoff + ymid + normRand(-5, 5) + 20, rand() * 100);
  } else if (tt == 2) {
    for (let i = 0; i < randChoice([1, 1, 1, 1, 2, 2, 3]); i++) {
      const xr = normRand(grbd.xmin, grbd.xmax);
      const yr = ymid;
      tree04(xoff + xr, yoff + yr + 20, {});
      for (let j = 0; j < rand() * 2; j++) {
        bigRock(xoff + Math.max(grbd.xmin, Math.min(grbd.xmax, xr + normRand(-50, 50))), yoff + yr + normRand(-5, 5) + 20, j * i * rand() * 100);
      }
    }
  } else if (tt == 3) {
    for (let i = 0; i < randChoice([1, 1, 1, 1, 2, 2, 3]); i++) tree06(xoff + normRand(grbd.xmin, grbd.xmax), yoff + ymid, { hei: 60 + rand() * 60 });
  } else if (tt == 4) {
    const pmin = rand() * 0.5;
    const pmax = rand() * 0.5 + 0.5;
    const xmin = grbd.xmin * (1 - pmin) + grbd.xmax * pmin;
    const xmax = grbd.xmin * (1 - pmax) + grbd.xmax * pmax;
    asMat('foliage', () => {
      for (let i = xmin; i < xmax; i += 20) tree07(xoff + i + 20 * normRand(-1, 1), yoff + ymid + normRand(-1, 1) + 0, { hei: normRand(40, 80) });
    });
  }

  asMat('foliage', () => {
    for (let i = 0; i < 50 * rand(); i++) tree02(xoff + normRand(grbd.xmin, grbd.xmax), yoff + normRand(grbd.ymin, grbd.ymax));
  });

  const ts = randChoice([0, 0, 0, 0, 1]);
  if (ts == 1 && tt != 4) {
    asMat('architecture', () =>
      arch01(xoff + normRand(grbd.xmin, grbd.xmax), yoff + ymid + 20, rand(), { wid: normRand(160, 200), hei: normRand(80, 100), per: rand() }),
    );
  }
}
