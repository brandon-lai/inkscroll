// Arch.* and Man.man from the original. Buildings big enough to survive the
// grid keep their geometry (hut, box, rail, roof: arch01, arch02). Figures,
// boats, pagodas (arch03) and the small two-storey pavilion (arch04) are under
// ~6 cells wide at 7x13 px, so they become hand-drawn sprites anchored where
// the original would have drawn them.

import { asLine, div, emitSprite, midPt, poly, type Pt, stroke, texture } from '../draw';
import { noise } from '../noise';
import { worldOptions } from '../options';
import { rgba, WHITE } from '../primitives';
import { normRand, rand, randChoice, wtrand } from '../rng';

function flip(ptlist: Pt[], axis = 0): Pt[] {
  for (let i = 0; i < ptlist.length; i++) ptlist[i][0] = axis - (ptlist[i][0] - axis);
  return ptlist;
}

function hut(xoff: number, yoff: number, args: { hei?: number; wid?: number; tex?: number } = {}): void {
  const hei = args.hei ?? 40;
  const wid = args.wid ?? 180;
  const tex = args.tex ?? 300;
  const reso = [10, 10];
  const ptlist: Pt[][] = [];
  for (let i = 0; i < reso[0]; i++) {
    ptlist.push([]);
    const heir = hei + hei * 0.2 * rand();
    for (let j = 0; j < reso[1]; j++) {
      const nx = wid * (i / (reso[0] - 1) - 0.5) * Math.pow(j / (reso[1] - 1), 0.7);
      const ny = heir * (j / (reso[1] - 1));
      ptlist[ptlist.length - 1].push([nx, ny]);
    }
  }
  poly(ptlist[0].slice(0, -1).concat(ptlist[ptlist.length - 1].slice(0, -1).reverse()), { xof: xoff, yof: yoff, fil: WHITE, str: null });
  asLine(0.8, () => {
    poly(ptlist[0], { xof: xoff, yof: yoff, fil: null, str: rgba(100, 0.3), wid: 2 });
    poly(ptlist[ptlist.length - 1], { xof: xoff, yof: yoff, fil: null, str: rgba(100, 0.3), wid: 2 });
  });
  texture(ptlist, {
    xof: xoff,
    yof: yoff,
    tex,
    wid: 1,
    len: 0.25,
    col: () => rgba(120, +(0.3 + rand() * 0.3).toFixed(3)),
    dis: () => wtrand((a) => a * a),
    noi: () => 5,
  });
}

interface Quad {
  pul: Pt;
  pur: Pt;
  pdl: Pt;
  pdr: Pt;
}

function box(
  xoff: number,
  yoff: number,
  args: { hei?: number; wid?: number; rot?: number; per?: number; tra?: boolean; bot?: boolean; wei?: number; dec?: (a: Quad) => Pt[][] } = {},
): void {
  const hei = args.hei ?? 20;
  const wid = args.wid ?? 120;
  const rot = args.rot ?? 0.7;
  const per = args.per ?? 4;
  const tra = args.tra ?? true;
  const bot = args.bot ?? true;
  const wei = args.wei ?? 3;
  const dec = args.dec ?? (() => []);

  const mid = -wid * 0.5 + wid * rot;
  const bmid = -wid * 0.5 + wid * (1 - rot);
  let ptlist: Pt[][] = [];
  ptlist.push(div([[-wid * 0.5, -hei], [-wid * 0.5, 0]], 5));
  ptlist.push(div([[wid * 0.5, -hei], [wid * 0.5, 0]], 5));
  if (bot) {
    ptlist.push(div([[-wid * 0.5, 0], [mid, per]], 5));
    ptlist.push(div([[wid * 0.5, 0], [mid, per]], 5));
  }
  ptlist.push(div([[mid, -hei], [mid, per]], 5));
  if (tra) {
    if (bot) {
      ptlist.push(div([[-wid * 0.5, 0], [bmid, -per]], 5));
      ptlist.push(div([[wid * 0.5, 0], [bmid, -per]], 5));
    }
    ptlist.push(div([[bmid, -hei], [bmid, -per]], 5));
  }
  const surf = (rot < 0.5 ? 1 : 0) * 2 - 1;
  ptlist = ptlist.concat(dec({ pul: [surf * wid * 0.5, -hei], pur: [mid, -hei + per], pdl: [surf * wid * 0.5, 0], pdr: [mid, per] }));
  const polist: Pt[] = [
    [-wid * 0.5, -hei],
    [wid * 0.5, -hei],
    [wid * 0.5, 0],
    [mid, per],
    [-wid * 0.5, 0],
  ];
  if (!tra) poly(polist, { xof: xoff, yof: yoff, str: null, fil: WHITE });
  asLine(0.8, () => {
    for (const pl of ptlist) {
      stroke(
        pl.map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
        { col: rgba(100, 0.4), noi: 1, wid: wei, fun: () => 1 },
      );
    }
  });
}

function deco(style: number, args: Partial<Quad> & { hsp?: number[]; vsp?: number[] } = {}): Pt[][] {
  const pul = args.pul ?? [0, 0];
  const pur = args.pur ?? [0, 100];
  const pdl = args.pdl ?? [100, 0];
  const pdr = args.pdr ?? [100, 100];
  const hsp = args.hsp ?? [1, 3];
  const vsp = args.vsp ?? [1, 2];
  const plist: Pt[][] = [];
  const dl = div([pul, pdl], vsp[1]);
  const dr = div([pur, pdr], vsp[1]);
  const du = div([pul, pur], hsp[1]);
  const dd = div([pdl, pdr], hsp[1]);
  if (style == 1) {
    // -| |-
    const mlu = du[hsp[0]];
    const mru = du[du.length - 1 - hsp[0]];
    const mld = dd[hsp[0]];
    const mrd = dd[du.length - 1 - hsp[0]];
    for (let i = vsp[0]; i < dl.length - vsp[0]; i += vsp[0]) {
      const mml = div([mlu, mld], vsp[1])[i];
      const mmr = div([mru, mrd], vsp[1])[i];
      plist.push(div([mml, dl[i]], 5));
      plist.push(div([mmr, dr[i]], 5));
    }
    plist.push(div([mlu, mld], 5));
    plist.push(div([mru, mrd], 5));
  } else if (style == 2) {
    // ||||
    for (let i = hsp[0]; i < du.length - hsp[0]; i += hsp[0]) plist.push(div([du[i], dd[i]], 5));
  } else if (style == 3) {
    // |##|
    const mlu = du[hsp[0]];
    const mru = du[du.length - 1 - hsp[0]];
    const mld = dd[hsp[0]];
    const mrd = dd[du.length - 1 - hsp[0]];
    for (let i = vsp[0]; i < dl.length - vsp[0]; i += vsp[0]) {
      const mml = div([mlu, mld], vsp[1])[i];
      const mmr = div([mru, mrd], vsp[1])[i];
      const mmu = div([mlu, mru], vsp[1])[i];
      const mmd = div([mld, mrd], vsp[1])[i];
      plist.push(div([mml, mmr], 5));
      plist.push(div([mmu, mmd], 5));
    }
    plist.push(div([mlu, mld], 5));
    plist.push(div([mru, mrd], 5));
  }
  return plist;
}

function rail(
  xoff: number,
  yoff: number,
  seed: number,
  args: { hei?: number; wid?: number; rot?: number; per?: number; seg?: number; wei?: number; tra?: boolean; fro?: boolean } = {},
): void {
  const hei = args.hei ?? 20;
  const wid = args.wid ?? 180;
  const rot = args.rot ?? 0.7;
  const per = args.per ?? 4;
  const seg = args.seg ?? 4;
  const wei = args.wei ?? 1;
  const tra = args.tra ?? true;
  const fro = args.fro ?? true;

  const mid = -wid * 0.5 + wid * rot;
  const bmid = -wid * 0.5 + wid * (1 - rot);
  const ptlist: Pt[][] = [];
  if (fro) {
    ptlist.push(div([[-wid * 0.5, 0], [mid, per]], seg));
    ptlist.push(div([[mid, per], [wid * 0.5, 0]], seg));
  }
  if (tra) {
    ptlist.push(div([[-wid * 0.5, 0], [bmid, -per]], seg));
    ptlist.push(div([[bmid, -per], [wid * 0.5, 0]], seg));
  }
  if (fro) {
    ptlist.push(div([[-wid * 0.5, -hei], [mid, -hei + per]], seg));
    ptlist.push(div([[mid, -hei + per], [wid * 0.5, -hei]], seg));
  }
  if (tra) {
    ptlist.push(div([[-wid * 0.5, -hei], [bmid, -hei - per]], seg));
    ptlist.push(div([[bmid, -hei - per], [wid * 0.5, -hei]], seg));
  }
  if (tra) {
    const open = Math.floor(rand() * ptlist.length);
    ptlist[open] = ptlist[open].slice(0, -1);
    ptlist[(open + ptlist.length) % ptlist.length] = ptlist[(open + ptlist.length) % ptlist.length].slice(0, -1);
  }
  for (let i = 0; i < ptlist.length / 2; i++) {
    for (let j = 0; j < ptlist[i].length; j++) {
      const other = ptlist[(ptlist.length / 2 + i) % ptlist.length];
      ptlist[i][j][1] += (noise(i, j * 0.5, seed) - 0.5) * hei;
      other[j % other.length][1] += (noise(i + 0.5, j * 0.5, seed) - 0.5) * hei;
      const ln = div([ptlist[i][j], other[j % other.length]], 2);
      ln[0][0] += (rand() - 0.5) * hei * 0.5;
      poly(ln, { xof: xoff, yof: yoff, fil: null, str: rgba(100, 0.5), wid: 2 });
    }
  }
  asLine(0.6, () => {
    for (const pl of ptlist) {
      stroke(
        pl.map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
        { col: rgba(100, 0.5), noi: 0.5, wid: wei, fun: () => 1 },
      );
    }
  });
}

function roof(
  xoff: number,
  yoff: number,
  args: { hei?: number; wid?: number; rot?: number; per?: number; cor?: number; wei?: number; pla?: [number, string] } = {},
): void {
  const hei = args.hei ?? 20;
  const wid = args.wid ?? 120;
  const rot = args.rot ?? 0.7;
  const per = args.per ?? 4;
  const cor = args.cor ?? 5;
  const wei = args.wei ?? 3;
  const pla = args.pla ?? [0, ''];

  const opf = (ptlist: Pt[]) => (rot < 0.5 ? flip(ptlist) : ptlist);
  const rrot = rot < 0.5 ? 1 - rot : rot;
  const mid = -wid * 0.5 + wid * rrot;
  const quat = (mid + wid * 0.5) * 0.5 - mid;

  const ptlist: Pt[][] = [];
  ptlist.push(div(opf([[-wid * 0.5 + quat, -hei - per / 2], [-wid * 0.5 + quat * 0.5, -hei / 2 - per / 4], [-wid * 0.5 - cor, 0]]), 5));
  ptlist.push(div(opf([[mid + quat, -hei], [(mid + quat + wid * 0.5) / 2, -hei / 2], [wid * 0.5 + cor, 0]]), 5));
  ptlist.push(div(opf([[mid + quat, -hei], [mid + quat / 2, -hei / 2 + per / 2], [mid + cor, per]]), 5));
  ptlist.push(div(opf([[-wid * 0.5 - cor, 0], [mid + cor, per]]), 5));
  ptlist.push(div(opf([[wid * 0.5 + cor, 0], [mid + cor, per]]), 5));
  ptlist.push(div(opf([[-wid * 0.5 + quat, -hei - per / 2], [mid + quat, -hei]]), 5));

  const polist = opf([
    [-wid * 0.5, 0],
    [-wid * 0.5 + quat, -hei - per / 2],
    [mid + quat, -hei],
    [wid * 0.5, 0],
    [mid, per],
  ]);
  poly(polist, { xof: xoff, yof: yoff, str: null, fil: WHITE });
  asLine(0.8, () => {
    for (const pl of ptlist) {
      stroke(
        pl.map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
        { col: rgba(100, 0.4), noi: 1, wid: wei, fun: () => 1 },
      );
    }
  });
  if (pla[0] == 1) {
    // The roof sign. The original sets it as SVG text along the roof; here it
    // is a one-line text sprite at the same midpoint.
    let pp = opf([
      [mid + quat / 2, -hei / 2 + per / 2],
      [-wid * 0.5 + quat * 0.5, -hei / 2 - per / 4],
    ]);
    if (pp[0][0] > pp[1][0]) pp = [pp[1], pp[0]];
    const mp = midPt(pp);
    emitSprite({ kind: 'label', variant: 0, x: mp[0] + xoff, y: mp[1] + yoff, flip: false, text: pla[1] });
  }
}

function pagroof(xoff: number, yoff: number, args: { hei?: number; wid?: number; per?: number; cor?: number; sid?: number; wei?: number } = {}): void {
  const hei = args.hei ?? 20;
  const wid = args.wid ?? 120;
  const per = args.per ?? 4;
  const cor = args.cor ?? 10;
  const sid = args.sid ?? 4;
  const wei = args.wei ?? 3;
  const ptlist: Pt[][] = [];
  const polist: Pt[] = [[0, -hei]];
  for (let i = 0; i < sid; i++) {
    const fx = wid * ((i * 1.0) / (sid - 1) - 0.5);
    const fy = per * (1 - Math.abs((i * 1.0) / (sid - 1) - 0.5) * 2);
    const fxx = (wid + cor) * ((i * 1.0) / (sid - 1) - 0.5);
    if (i > 0) ptlist.push([ptlist[ptlist.length - 1][2], [fxx, fy]]);
    ptlist.push([[0, -hei], [fx * 0.5, (-hei + fy) * 0.5], [fxx, fy]]);
    polist.push([fxx, fy]);
  }
  poly(polist, { xof: xoff, yof: yoff, str: null, fil: WHITE });
  for (const pl of ptlist) {
    stroke(
      div(pl, 5).map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
      { col: rgba(100, 0.4), noi: 1, wid: wei, fun: () => 1 },
    );
  }
}

/** Man.man: a figure. Placed as a sprite; the original's limb rig is ~3 cells tall. */
export function man(xoff: number, yoff: number, args: { sca?: number; fli?: boolean } = {}): void {
  emitSprite({ kind: 'figure', variant: Math.floor(rand() * 4), x: xoff, y: yoff, flip: args.fli ?? true });
}

/** arch01: a pavilion on a terrace with rails, sometimes with one or two people. */
export function arch01(xoff: number, yoff: number, seed: number, args: { hei?: number; wid?: number; rot?: number; per?: number } = {}): void {
  const hei = args.hei ?? 70;
  const wid = args.wid ?? 180;
  const per = args.per ?? 5;
  const p = 0.4 + rand() * 0.2;
  const h0 = hei * p;
  const h1 = hei * (1 - p);
  hut(xoff, yoff - hei, { hei: h0, wid });
  box(xoff, yoff, { hei: h1, wid: (wid * 2) / 3, per, bot: false });
  rail(xoff, yoff, seed, { tra: true, fro: false, hei: 10, wid, per: per * 2, seg: (3 + rand() * 3) | 0 });
  const mcnt = randChoice([0, 1, 1, 2]);
  if (mcnt == 1) {
    man(xoff + normRand(-wid / 3, wid / 3), yoff, { fli: randChoice([true, false]), sca: 0.42 });
  } else if (mcnt == 2) {
    man(xoff + normRand(-wid / 4, -wid / 5), yoff, { fli: false, sca: 0.42 });
    man(xoff + normRand(wid / 5, wid / 4), yoff, { fli: true, sca: 0.42 });
  }
  rail(xoff, yoff, seed, { tra: false, fro: true, hei: 10, wid, per: per * 2, seg: (3 + rand() * 3) | 0 });
}

/** arch02: a stack of one to three boxes with roofs (houses at mountain feet). */
export function arch02(
  xoff: number,
  yoff: number,
  seed: number,
  args: { hei?: number; wid?: number; rot?: number; per?: number; sto?: number; sty?: number; rai?: boolean } = {},
): void {
  const hei = args.hei ?? 10;
  const wid = args.wid ?? 50;
  const rot = args.rot ?? 0.3;
  const per = args.per ?? 5;
  const sto = args.sto ?? 3;
  const sty = args.sty ?? 1;
  const rai = args.rai ?? false;
  let hoff = 0;
  for (let i = 0; i < sto; i++) {
    box(xoff, yoff - hoff, {
      tra: false,
      hei,
      wid: wid * Math.pow(0.85, i),
      rot,
      wei: 1.5,
      per,
      dec: (a) => deco(sty, { ...a, hsp: [[], [1, 5], [1, 5], [1, 4]][sty], vsp: [[], [1, 2], [1, 2], [1, 3]][sty] }),
    });
    if (rai) rail(xoff, yoff - hoff, i * 0.2, { wid: wid * Math.pow(0.85, i) * 1.1, hei: hei / 2, per, rot, wei: 0.5, tra: false });
    let pla: [number, string] | undefined;
    // Drawn whether or not whimsy is on, so the flag never shifts anything else.
    if (sto == 1 && rand() < 1 / 3 && worldOptions.whimsy) pla = [1, 'Pizza Hut'];
    roof(xoff, yoff - hoff - hei, { hei, wid: wid * Math.pow(0.9, i), rot, wei: 1.5, per, pla });
    hoff += hei * 1.5;
  }
  void seed;
}

/** arch03: a 5- or 7-storey pagoda on a peak. Sprite: its tiers are ~2 cells each. */
export function arch03(xoff: number, yoff: number, seed: number, args: { sto?: number; wid?: number } = {}): void {
  const sto = args.sto ?? 7;
  emitSprite({ kind: 'pagoda', variant: sto >= 7 ? 1 : 0, x: xoff, y: yoff, flip: rand() < 0.5 });
  void seed;
}

/** arch04: a small one- or two-storey pavilion (~5 cells wide). Sprite. */
export function arch04(xoff: number, yoff: number, seed: number, args: { sto?: number } = {}): void {
  const sto = args.sto ?? 2;
  emitSprite({ kind: 'pavilion', variant: (sto - 1) * 2 + (rand() < 0.5 ? 0 : 1), x: xoff, y: yoff, flip: rand() < 0.5 });
  void seed;
}

/** boat01: a boat with a fisherman. Sprite; animated on the main thread. */
export function boat01(xoff: number, yoff: number, seed: number, args: { sca?: number; fli?: boolean } = {}): void {
  const sca = args.sca ?? 1;
  emitSprite({ kind: 'boat', variant: Math.floor(rand() * 3) + (sca > 0.7 ? 3 : 0), x: xoff, y: yoff, flip: args.fli ?? false });
  void seed;
}

/** transmissionTower01: one of the original's anachronisms; only drawn with whimsy on. */
export function transmissionTower01(xoff: number, yoff: number, seed: number, args: { hei?: number; wid?: number } = {}): void {
  if (!worldOptions.whimsy) return;
  const hei = args.hei ?? 100;
  const wid = args.wid ?? 20;
  const toGlobal = (v: Pt): Pt => [v[0] + xoff, v[1] + yoff];
  const quickstroke = (pl: Pt[]) => stroke(div(pl, 5).map(toGlobal), { wid: 1, fun: () => 0.5, col: rgba(100, 0.4) });
  const p00: Pt = [-wid * 0.05, -hei];
  const p01: Pt = [wid * 0.05, -hei];
  const p10: Pt = [-wid * 0.1, -hei * 0.9];
  const p11: Pt = [wid * 0.1, -hei * 0.9];
  const p20: Pt = [-wid * 0.2, -hei * 0.5];
  const p21: Pt = [wid * 0.2, -hei * 0.5];
  const p30: Pt = [-wid * 0.5, 0];
  const p31: Pt = [wid * 0.5, 0];
  const bch = [
    [0.7, -0.85],
    [1, -0.675],
    [0.7, -0.5],
  ];
  for (const b of bch) {
    quickstroke([[-b[0] * wid, b[1] * hei], [b[0] * wid, b[1] * hei]]);
    quickstroke([[-b[0] * wid, b[1] * hei], [0, (b[1] - 0.05) * hei]]);
    quickstroke([[b[0] * wid, b[1] * hei], [0, (b[1] - 0.05) * hei]]);
    quickstroke([[-b[0] * wid, b[1] * hei], [-b[0] * wid, (b[1] + 0.1) * hei]]);
    quickstroke([[b[0] * wid, b[1] * hei], [b[0] * wid, (b[1] + 0.1) * hei]]);
  }
  const l10 = div([p00, p10, p20, p30], 5);
  const l11 = div([p01, p11, p21, p31], 5);
  for (let i = 0; i < l10.length - 1; i++) {
    quickstroke([l10[i], l11[i + 1]]);
    quickstroke([l11[i], l10[i + 1]]);
  }
  quickstroke([p00, p01]);
  quickstroke([p10, p11]);
  quickstroke([p20, p21]);
  quickstroke([p00, p10, p20, p30]);
  quickstroke([p01, p11, p21, p31]);
  void seed;
}
