// Tree.tree01 .. tree08 with branch / twig / barkify, ported from the original.
// Callers draw trees as `foliage`; trunks, bark and branches switch to `trunk`.

import { asLine, asMat, blob, capture, div, distance, midPt, poly, type Pt, stroke, triangulate } from '../draw';
import { noise } from '../noise';
import { type Col, rgba, WHITE } from '../primitives';
import { normRand, rand, randChoice, randGaussian } from '../rng';

const DEFAULT_COL = rgba(100, 0.5);
const leafAlpha = (c: Col, extra: number, digits: number) => +(extra + c.a).toFixed(digits);

export function tree01(x: number, y: number, args: { hei?: number; wid?: number; col?: Col } = {}): void {
  const hei = args.hei ?? 50;
  const wid = args.wid ?? 3;
  const col = args.col ?? DEFAULT_COL;
  const reso = 10;
  const nslist: [number, number][] = [];
  for (let i = 0; i < reso; i++) nslist.push([noise(i * 0.5), noise(i * 0.5, 0.5)]);
  const line1: Pt[] = [];
  const line2: Pt[] = [];
  for (let i = 0; i < reso; i++) {
    const nx = x;
    const ny = y - (i * hei) / reso;
    if (i >= reso / 4) {
      for (let j = 0; j < (reso - i) / 5; j++) {
        blob(nx + (rand() - 0.5) * wid * 1.2 * (reso - i), ny + (rand() - 0.5) * wid, {
          len: rand() * 20 * (reso - i) * 0.2 + 10,
          wid: rand() * 6 + 3,
          ang: ((rand() - 0.5) * Math.PI) / 6,
          col: rgba(col.g, leafAlpha(col, rand() * 0.2, 1)),
        });
      }
    }
    line1.push([nx + (nslist[i][0] - 0.5) * wid - wid / 2, ny]);
    line2.push([nx + (nslist[i][1] - 0.5) * wid + wid / 2, ny]);
  }
  asMat('trunk', () =>
    asLine(0.7, () => {
      poly(line1, { fil: null, str: col, wid: 1.5 });
      poly(line2, { fil: null, str: col, wid: 1.5 });
    }),
  );
}

export function tree02(x: number, y: number, args: { hei?: number; wid?: number; clu?: number; col?: Col } = {}): void {
  const hei = args.hei ?? 16;
  const wid = args.wid ?? 8;
  const clu = args.clu ?? 5;
  const col = args.col ?? DEFAULT_COL;
  for (let i = 0; i < clu; i++) {
    blob(x + randGaussian() * clu * 4, y + randGaussian() * clu * 4, {
      ang: Math.PI / 2,
      fun: (x) => (x <= 1 ? Math.pow(Math.sin(x * Math.PI) * x, 0.5) : -Math.pow(Math.sin((x - 2) * Math.PI * (x - 2)), 0.5)),
      wid: rand() * wid * 0.75 + wid * 0.5,
      len: rand() * hei * 0.75 + hei * 0.5,
      col,
    });
  }
}

export function tree03(x: number, y: number, args: { hei?: number; wid?: number; ben?: (x: number) => number; col?: Col } = {}): void {
  const hei = args.hei ?? 50;
  const wid = args.wid ?? 5;
  const ben = args.ben ?? (() => 0);
  const col = args.col ?? DEFAULT_COL;
  const reso = 10;
  const nslist: [number, number][] = [];
  for (let i = 0; i < reso; i++) nslist.push([noise(i * 0.5), noise(i * 0.5, 0.5)]);
  const blobs: (() => void)[] = [];
  const line1: Pt[] = [];
  const line2: Pt[] = [];
  for (let i = 0; i < reso; i++) {
    const nx = x + ben(i / reso) * 100;
    const ny = y - (i * hei) / reso;
    if (i >= reso / 5) {
      for (let j = 0; j < (reso - i) * 2; j++) {
        const shape = (x: number) => Math.log(50 * x + 1) / 3.95;
        const ox = rand() * wid * 2 * shape((reso - i) / reso);
        const bx = nx + ox * randChoice([-1, 1]);
        const by = ny + (rand() - 0.5) * wid * 2;
        const bargs = {
          len: ox * 2,
          wid: rand() * 6 + 3,
          ang: ((rand() - 0.5) * Math.PI) / 6,
          col: rgba(col.g, leafAlpha(col, rand() * 0.2, 3)),
        };
        blobs.push(capture(() => blob(bx, by, bargs)));
      }
    }
    line1.push([nx + (((nslist[i][0] - 0.5) * wid - wid / 2) * (reso - i)) / reso, ny]);
    line2.push([nx + (((nslist[i][1] - 0.5) * wid + wid / 2) * (reso - i)) / reso, ny]);
  }
  const lc = line1.concat(line2.reverse());
  asMat('trunk', () => asLine(0.7, () => poly(lc, { fil: WHITE, str: col, wid: 1.5 })));
  for (const b of blobs) b();
}

function branch(args: { hei?: number; wid?: number; ang?: number; det?: number; ben?: number } = {}): [Pt[], Pt[]] {
  const hei = args.hei ?? 300;
  const wid = args.wid ?? 6;
  const ang = args.ang ?? 0;
  const det = args.det ?? 10;
  const ben = args.ben ?? Math.PI * 0.2;

  let nx = 0;
  let ny = 0;
  const tlist: Pt[] = [[nx, ny]];
  let a0 = 0;
  const g = 3;
  for (let i = 0; i < g; i++) {
    a0 += (ben / 2 + (rand() * ben) / 2) * randChoice([-1, 1]);
    nx += (Math.cos(a0) * hei) / g;
    ny -= (Math.sin(a0) * hei) / g;
    tlist.push([nx, ny]);
  }
  const ta = Math.atan2(tlist[tlist.length - 1][1], tlist[tlist.length - 1][0]);
  for (let i = 0; i < tlist.length; i++) {
    const a = Math.atan2(tlist[i][1], tlist[i][0]);
    const d = Math.sqrt(tlist[i][0] * tlist[i][0] + tlist[i][1] * tlist[i][1]);
    tlist[i][0] = d * Math.cos(a - ta + ang);
    tlist[i][1] = d * Math.sin(a - ta + ang);
  }

  const trlist1: Pt[] = [];
  const trlist2: Pt[] = [];
  const span = det;
  const tl = (tlist.length - 1) * span;
  let lx = 0;
  let ly = 0;
  for (let i = 0; i < tl; i += 1) {
    const lastp = tlist[Math.floor(i / span)];
    const nextp = tlist[Math.ceil(i / span)];
    const p = (i % span) / span;
    const nx2 = lastp[0] * (1 - p) + nextp[0] * p;
    const ny2 = lastp[1] * (1 - p) + nextp[1] * p;
    const a = Math.atan2(ny2 - ly, nx2 - lx);
    const woff = ((noise(i * 0.3) - 0.5) * wid * hei) / 80;
    let b = 0;
    if (p == 0) b = rand() * wid;
    const nw = wid * (((tl - i) / tl) * 0.5 + 0.5);
    trlist1.push([nx2 + Math.cos(a + Math.PI / 2) * (nw + woff + b), ny2 + Math.sin(a + Math.PI / 2) * (nw + woff + b)]);
    trlist2.push([nx2 + Math.cos(a - Math.PI / 2) * (nw - woff + b), ny2 + Math.sin(a - Math.PI / 2) * (nw - woff + b)]);
    lx = nx2;
    ly = ny2;
  }
  return [trlist1, trlist2];
}

function twig(tx: number, ty: number, dep: number, args: { dir?: number; sca?: number; wid?: number; ang?: number; lea?: [boolean, number] } = {}): void {
  const dir = args.dir ?? 1;
  const sca = args.sca ?? 1;
  const wid = args.wid ?? 1;
  const ang = args.ang ?? 0;
  const lea = args.lea ?? [true, 12];

  const twlist: Pt[] = [];
  const tl = 10;
  const hs = rand() * 0.5 + 0.5;
  // fun2 in the original reads the loop variable `i` from the enclosing scope.
  const tfun = (i: number) => -1 / Math.pow(i / tl + 1, 5) + 1;
  randChoice([0]);
  const a0 = ((rand() * Math.PI) / 6) * dir + ang;
  for (let i = 0; i < tl; i++) {
    const mx = dir * tfun(i) * 50 * sca * hs;
    const my = -i * 5 * sca;
    const a = Math.atan2(my, mx);
    const d = Math.pow(mx * mx + my * my, 0.5);
    const nx = Math.cos(a + a0) * d;
    const ny = Math.sin(a + a0) * d;
    twlist.push([nx + tx, ny + ty]);
    if ((i == ((tl / 3) | 0) || i == (((tl * 2) / 3) | 0)) && dep > 0) {
      twig(nx + tx, ny + ty, dep - 1, { ang, sca: sca * 0.8, wid, dir: dir * randChoice([-1, 1]), lea });
    }
    if (i == tl - 1 && lea[0] == true) {
      asMat('foliage', () => {
        for (let j = 0; j < 5; j++) {
          const dj = (j - 2.5) * 5;
          blob(nx + tx + Math.cos(ang) * dj * wid, ny + ty + (Math.sin(ang) * dj - lea[1] / (dep + 1)) * wid, {
            wid: (6 + 3 * rand()) * wid,
            len: (15 + 12 * rand()) * wid,
            ang: ang / 2 + Math.PI / 2 + Math.PI * 0.2 * (rand() - 0.5),
            col: rgba(100, +(0.5 + dep * 0.2).toFixed(3)),
            fun: (x) => (x <= 1 ? Math.pow(Math.sin(x * Math.PI) * x, 0.5) : -Math.pow(Math.sin((x - 2) * Math.PI * (x - 2)), 0.5)),
          });
        }
      });
    }
  }
  stroke(twlist, { wid: 1, fun: (x) => Math.cos((x * Math.PI) / 2), col: rgba(100, 0.5) });
}

function barkify(x: number, y: number, trlist: [Pt[], Pt[]]): void {
  function bark(bx: number, by: number, wid: number, ang: number): void {
    const len = 10 + 10 * rand();
    const noi = 0.5;
    const fun = (x: number) => (x <= 1 ? Math.pow(Math.sin(x * Math.PI), 0.5) : -Math.pow(Math.sin((x + 1) * Math.PI), 0.5));
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
    // loopNoise, inlined in the original
    const dif = nslist[nslist.length - 1] - nslist[0];
    let lo = 100,
      hi = -100;
    for (let i = 0; i < nslist.length; i++) {
      nslist[i] += (dif * (nslist.length - 1 - i)) / (nslist.length - 1);
      lo = Math.min(lo, nslist[i]);
      hi = Math.max(hi, nslist[i]);
    }
    const brklist: Pt[] = [];
    for (let i = 0; i < lalist.length; i++) {
      const ns = ((nslist[i] - lo) / (hi - lo)) * noi + (1 - noi);
      brklist.push([bx + Math.cos(lalist[i][1] + ang) * lalist[i][0] * ns, by + Math.sin(lalist[i][1] + ang) * lalist[i][0] * ns]);
    }
    const fr = rand();
    stroke(brklist, { wid: 0.8, noi: 0, col: rgba(100, 0.4), out: 0, fun: (x) => Math.sin((x + fr) * Math.PI * 3) });
  }

  for (let i = 2; i < trlist[0].length - 1; i++) {
    const a0 = Math.atan2(trlist[0][i][1] - trlist[0][i - 1][1], trlist[0][i][0] - trlist[0][i - 1][0]);
    const a1 = Math.atan2(trlist[1][i][1] - trlist[1][i - 1][1], trlist[1][i][0] - trlist[1][i - 1][0]);
    const p = rand();
    const nx = trlist[0][i][0] * (1 - p) + trlist[1][i][0] * p;
    const ny = trlist[0][i][1] * (1 - p) + trlist[1][i][1] * p;
    if (rand() < 0.2) {
      blob(nx + x, ny + y, { noi: 1, len: 15, wid: 6 - Math.abs(p - 0.5) * 10, ang: (a0 + a1) / 2, col: rgba(100, 0.6) });
    } else {
      bark(nx + x, ny + y, 5 - Math.abs(p - 0.5) * 10, (a0 + a1) / 2);
    }
    if (rand() < 0.05) {
      const jl = rand() * 2 + 2;
      const xya = randChoice([
        [trlist[0][i][0], trlist[0][i][1], a0],
        [trlist[1][i][0], trlist[1][i][1], a1],
      ]);
      for (let j = 0; j < jl; j++) {
        blob(xya[0] + x + Math.cos(xya[2]) * (j - jl / 2) * 4, xya[1] + y + Math.sin(xya[2]) * (j - jl / 2) * 4, {
          wid: 4,
          len: 4 + 6 * rand(),
          ang: a0 + Math.PI / 2,
          col: rgba(100, 0.6),
        });
      }
    }
  }
  const trflist = trlist[0].concat(trlist[1].slice().reverse());
  const rglist: Pt[][] = [[]];
  for (let i = 0; i < trflist.length; i++) {
    if (rand() < 0.5) rglist.push([]);
    else rglist[rglist.length - 1].push(trflist[i]);
  }
  for (let i = 0; i < rglist.length; i++) {
    rglist[i] = div(rglist[i], 4);
    for (let j = 0; j < rglist[i].length; j++) {
      rglist[i][j][0] += (noise(i, j * 0.1, 1) - 0.5) * (15 + 5 * randGaussian());
      rglist[i][j][1] += (noise(i, j * 0.1, 2) - 0.5) * (15 + 5 * randGaussian());
    }
    stroke(
      rglist[i].map((v) => [v[0] + x, v[1] + y] as Pt),
      { wid: 1.5, col: rgba(100, 0.7), out: 0 },
    );
  }
}

/** Trunk outline (white occluder) plus a rough brush stroke along it, shared by tree04/05/06/08. */
function trunkBody(trmlist: Pt[], x: number, y: number, col: Col, alpha: number): void {
  poly(trmlist, { xof: x, yof: y, fil: WHITE, str: col, wid: 0 });
  const inner = trmlist.slice(1, -1);
  asLine(0.9, () =>
    stroke(
      inner.map((v) => [v[0] + x, v[1] + y] as Pt),
      { col: rgba(100, alpha), wid: 2.5, fun: () => Math.sin(1), noi: 0.9, out: 0 },
    ),
  );
}

export function tree04(x: number, y: number, args: { hei?: number; wid?: number; col?: Col } = {}): void {
  asMat('trunk', () => tree04Body(x, y, args));
}
function tree04Body(x: number, y: number, args: { hei?: number; wid?: number; col?: Col }): void {
  const hei = args.hei ?? 300;
  const wid = args.wid ?? 6;
  const col = args.col ?? DEFAULT_COL;
  const later: (() => void)[] = [];
  const twigs: (() => void)[] = [];

  const tr = branch({ hei, wid, ang: -Math.PI / 2 });
  later.push(capture(() => barkify(x, y, tr)));
  const trlist = tr[0].concat(tr[1].reverse());
  let trmlist: Pt[] = [];
  for (let i = 0; i < trlist.length; i++) {
    if ((i >= trlist.length * 0.3 && i <= trlist.length * 0.7 && rand() < 0.1) || i == trlist.length / 2 - 1) {
      const ba = Math.PI * 0.2 - Math.PI * 1.4 * (i > trlist.length / 2 ? 1 : 0);
      const brlist = branch({ hei: hei * (rand() + 1) * 0.3, wid: wid * 0.5, ang: ba });
      brlist[0].splice(0, 1);
      brlist[1].splice(0, 1);
      const foff = (v: Pt): Pt => [v[0] + trlist[i][0], v[1] + trlist[i][1]];
      const shifted: [Pt[], Pt[]] = [brlist[0].map(foff), brlist[1].map(foff)];
      later.push(capture(() => barkify(x, y, shifted)));
      for (let j = 0; j < brlist[0].length; j++) {
        if (rand() < 0.2 || j == brlist[0].length - 1) {
          const tx = brlist[0][j][0] + trlist[i][0] + x;
          const ty = brlist[0][j][1] + trlist[i][1] + y;
          twigs.push(capture(() => twig(tx, ty, 1, { wid: hei / 300, ang: ba > -Math.PI / 2 ? ba : ba + Math.PI, sca: (0.5 * hei) / 300, dir: ba > -Math.PI / 2 ? 1 : -1 })));
        }
      }
      trmlist = trmlist.concat(brlist[0].concat(brlist[1].reverse()).map(foff));
    } else {
      trmlist.push(trlist[i]);
    }
  }
  trunkBody(trmlist, x, y, col, +(0.4 + rand() * 0.1).toFixed(3));
  for (const f of later) f();
  for (const f of twigs) f();
}

export function tree05(x: number, y: number, args: { hei?: number; wid?: number; col?: Col } = {}): void {
  asMat('trunk', () => tree05Body(x, y, args));
}
function tree05Body(x: number, y: number, args: { hei?: number; wid?: number; col?: Col }): void {
  const hei = args.hei ?? 300;
  const wid = args.wid ?? 5;
  const col = args.col ?? DEFAULT_COL;
  const later: (() => void)[] = [];
  const twigs: (() => void)[] = [];

  const tr = branch({ hei, wid, ang: -Math.PI / 2, ben: 0 });
  later.push(capture(() => barkify(x, y, tr)));
  const trlist = tr[0].concat(tr[1].reverse());
  let trmlist: Pt[] = [];
  for (let i = 0; i < trlist.length; i++) {
    const p = Math.abs(i - trlist.length * 0.5) / (trlist.length * 0.5);
    if ((i >= trlist.length * 0.2 && i <= trlist.length * 0.8 && i % 3 == 0 && rand() > p) || i == trlist.length / 2 - 1) {
      const bar = rand() * 0.2;
      const ba = -bar * Math.PI - (1 - bar * 2) * Math.PI * (i > trlist.length / 2 ? 1 : 0);
      const brlist = branch({ hei: hei * (0.3 * p - rand() * 0.05), wid: wid * 0.5, ang: ba, ben: 0.5 });
      brlist[0].splice(0, 1);
      brlist[1].splice(0, 1);
      for (let j = 0; j < brlist[0].length; j++) {
        if (j % 20 == 0 || j == brlist[0].length - 1) {
          const tx = brlist[0][j][0] + trlist[i][0] + x;
          const ty = brlist[0][j][1] + trlist[i][1] + y;
          twigs.push(capture(() => twig(tx, ty, 0, { wid: hei / 300, ang: ba > -Math.PI / 2 ? ba : ba + Math.PI, sca: (0.2 * hei) / 300, dir: ba > -Math.PI / 2 ? 1 : -1, lea: [true, 5] })));
        }
      }
      trmlist = trmlist.concat(brlist[0].concat(brlist[1].reverse()).map((v) => [v[0] + trlist[i][0], v[1] + trlist[i][1]] as Pt));
    } else {
      trmlist.push(trlist[i]);
    }
  }
  trunkBody(trmlist, x, y, col, +(0.4 + rand() * 0.1).toFixed(3));
  for (const f of later) f();
  for (const f of twigs) f();
}

export function tree06(x: number, y: number, args: { hei?: number; wid?: number; col?: Col } = {}): void {
  asMat('trunk', () => tree06Body(x, y, args));
}
function tree06Body(x: number, y: number, args: { hei?: number; wid?: number; col?: Col }): void {
  const hei = args.hei ?? 100;
  const wid = args.wid ?? 6;
  const col = args.col ?? DEFAULT_COL;
  const later: (() => void)[] = [];
  const twigs: (() => void)[] = [];

  function fracTree(xoff: number, yoff: number, dep: number, a: { hei?: number; wid?: number; ang?: number; ben?: number } = {}): Pt[] {
    const h = a.hei ?? 300;
    const w = a.wid ?? 5;
    const ang = a.ang ?? 0;
    const ben = a.ben ?? Math.PI * 0.2;
    const tr = branch({ hei: h, wid: w, ang, ben, det: h / 20 });
    later.push(capture(() => barkify(xoff, yoff, tr)));
    const trlist = tr[0].concat(tr[1].reverse());
    let trmlist: Pt[] = [];
    for (let i = 0; i < trlist.length; i++) {
      if (
        ((rand() < 0.025 && i >= trlist.length * 0.2 && i <= trlist.length * 0.8) ||
          i == ((trlist.length / 2) | 0) - 1 ||
          i == ((trlist.length / 2) | 0) + 1) &&
        dep > 0
      ) {
        const bar = 0.02 + rand() * 0.08;
        const ba = bar * Math.PI - bar * 2 * Math.PI * (i > trlist.length / 2 ? 1 : 0);
        const brlist = fracTree(trlist[i][0] + xoff, trlist[i][1] + yoff, dep - 1, { hei: h * (0.7 + rand() * 0.2), wid: w * 0.6, ang: ang + ba, ben: 0.55 });
        for (let j = 0; j < brlist.length; j++) {
          if (rand() < 0.03) {
            const tx = brlist[j][0] + trlist[i][0] + xoff;
            const ty = brlist[j][1] + trlist[i][1] + yoff;
            twigs.push(capture(() => twig(tx, ty, 2, { ang: ba * (rand() * 0.5 + 0.75), sca: 0.3, dir: ba > 0 ? 1 : -1, lea: [false, 0] })));
          }
        }
        trmlist = trmlist.concat(brlist.map((v) => [v[0] + trlist[i][0], v[1] + trlist[i][1]] as Pt));
      } else {
        trmlist.push(trlist[i]);
      }
    }
    return trmlist;
  }

  const trmlist = fracTree(x, y, 3, { hei, wid, ang: -Math.PI / 2, ben: 0 });
  trunkBody(trmlist, x, y, col, +(0.4 + rand() * 0.1).toFixed(3));
  for (const f of later) f();
  for (const f of twigs) f();
}

export function tree07(x: number, y: number, args: { hei?: number; wid?: number; ben?: (x: number) => number; col?: Col } = {}): void {
  const hei = args.hei ?? 60;
  const wid = args.wid ?? 4;
  const ben = args.ben ?? ((x: number) => Math.sqrt(x) * 0.2);
  const reso = 10;
  const nslist: [number, number][] = [];
  for (let i = 0; i < reso; i++) nslist.push([noise(i * 0.5), noise(i * 0.5, 0.5)]);
  const line1: Pt[] = [];
  const line2: Pt[] = [];
  let T: Pt[][] = [];
  for (let i = 0; i < reso; i++) {
    const nx = x + ben(i / reso) * 100;
    const ny = y - (i * hei) / reso;
    if (i >= reso / 4) {
      const bpl = blob(nx + (rand() - 0.5) * wid * 1.2 * (reso - i) * 0.5, ny + (rand() - 0.5) * wid * 0.5, {
        len: rand() * 50 + 20,
        wid: rand() * 12 + 12,
        ang: (-rand() * Math.PI) / 6,
        fun: (x) => (x <= 1 ? 2.75 * x * Math.pow(1 - x, 1 / 1.8) : 2.75 * (x - 2) * Math.pow(x - 1, 1 / 1.8)),
        ret: 1,
      });
      T = T.concat(triangulate(bpl, { area: 50, convex: true, optimize: false }));
    }
    line1.push([nx + (nslist[i][0] - 0.5) * wid - wid / 2, ny]);
    line2.push([nx + (nslist[i][1] - 0.5) * wid + wid / 2, ny]);
  }
  T = triangulate(line1.concat(line2.reverse()), { area: 50, convex: true, optimize: true }).concat(T);
  for (let k = 0; k < T.length; k++) {
    const m = midPt(T[k]);
    const c = (noise(m[0] * 0.02, m[1] * 0.02) * 200 + 50) | 0;
    const co = rgba(c, 0.8);
    poly(T[k], { fil: co, str: co, wid: 0 });
  }
}

export function tree08(x: number, y: number, args: { hei?: number; wid?: number; col?: Col } = {}): void {
  asMat('trunk', () => tree08Body(x, y, args));
}
function tree08Body(x: number, y: number, args: { hei?: number; wid?: number; col?: Col }): void {
  const hei = args.hei ?? 80;
  const wid = args.wid ?? 1;
  const col = args.col ?? DEFAULT_COL;
  const twigs: (() => void)[] = [];
  const ang = normRand(-1, 1) * Math.PI * 0.2;
  const tr = branch({ hei, wid, ang: -Math.PI / 2 + ang, ben: Math.PI * 0.2, det: hei / 20 });
  const trlist = tr[0].concat(tr[1].reverse());

  function fracTree(xoff: number, yoff: number, dep: number, a: { ang?: number; len?: number; ben?: number; hei?: number } = {}): void {
    const fang = a.ang ?? -Math.PI / 2;
    const len = a.len ?? 15;
    const ben = a.ben ?? 0;
    const fun = dep == 0 ? (x: number) => Math.cos(0.5 * Math.PI * x) : () => 1;
    const spt: Pt = [xoff, yoff];
    const ept: Pt = [xoff + Math.cos(fang) * len, yoff + Math.sin(fang) * len];
    const bsign = randChoice([1, -1]);
    let trmlist = div(
      [
        [xoff, yoff],
        [xoff + len, yoff],
      ],
      10,
    );
    for (let i = 0; i < trmlist.length; i++) trmlist[i][1] += bsign * Math.sin((i / trmlist.length) * Math.PI) * 2;
    trmlist = trmlist.map((p) => {
      const d = distance(p, spt);
      const ag = Math.atan2(p[1] - spt[1], p[0] - spt[0]);
      return [spt[0] + d * Math.cos(ag + fang), spt[1] + d * Math.sin(ag + fang)];
    });
    stroke(trmlist, { fun, wid: 0.8, col: rgba(100, 0.5) });
    if (dep != 0) {
      const nben = ben + randChoice([-1, 1]) * Math.PI * 0.001 * dep * dep;
      if (rand() < 0.5) {
        fracTree(ept[0], ept[1], dep - 1, { ang: fang + ben + Math.PI * randChoice([normRand(-1, 0.5), normRand(0.5, 1)]) * 0.2, len: len * normRand(0.8, 0.9), ben: nben });
        fracTree(ept[0], ept[1], dep - 1, { ang: fang + ben + Math.PI * randChoice([normRand(-1, -0.5), normRand(0.5, 1)]) * 0.2, len: len * normRand(0.8, 0.9), ben: nben });
      } else {
        fracTree(ept[0], ept[1], dep - 1, { ang: fang + ben, len: len * normRand(0.8, 0.9), ben: nben });
      }
    }
  }

  for (let i = 0; i < trlist.length; i++) {
    if (rand() < 0.2) {
      const d = Math.floor(4 * rand());
      const a = -Math.PI / 2 - ang * rand();
      const px = x + trlist[i][0];
      const py = y + trlist[i][1];
      twigs.push(capture(() => fracTree(px, py, d, { hei: 20, ang: a })));
    } else if (i == Math.floor(trlist.length / 2)) {
      const px = x + trlist[i][0];
      const py = y + trlist[i][1];
      twigs.push(capture(() => fracTree(px, py, 3, { hei: 25, ang: -Math.PI / 2 + ang })));
    }
  }
  trunkBody([...trlist.slice(0, 1), ...trlist, ...trlist.slice(-1)], x, y, col, +(0.6 + rand() * 0.1).toFixed(3));
  for (const f of twigs) f();
  void wid;
}

