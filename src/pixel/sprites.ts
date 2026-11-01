// Pixel sprites for the elements too small to survive rasterising: figures
// and boats are hand-drawn; pagodas and pavilions are built from tiers so
// every one is a little different. '.' is transparent.

import { RED, S, WALL } from './palette';

export interface Sprite {
  w: number;
  h: number;
  /** Palette indices, 0 = transparent, row-major. */
  px: Uint8Array;
}

const KEY: Record<string, number> = {
  k: S.black,
  s: S.skin,
  r: S.robe,
  b: S.robeBlue,
  R: S.robeRed,
  h: S.hat,
  H: S.hatDark,
  w: S.wood,
  W: S.woodDark,
  l: S.sail,
  g: S.gold,
  t: S.tealRoof,
  T: S.tealRoofLight,
  c: WALL[0][0],
  C: WALL[0][1],
  e: RED[0][0],
  n: S.window,
  L: S.lantern,
};

function art(rows: string[]): Sprite {
  const w = Math.max(...rows.map((r) => r.length));
  const px = new Uint8Array(w * rows.length);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) px[y * w + x] = KEY[r[x]] ?? 0;
  });
  return { w, h: rows.length, px };
}

export function flipped(s: Sprite): Sprite {
  const px = new Uint8Array(s.px.length);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) px[y * s.w + x] = s.px[y * s.w + (s.w - 1 - x)];
  return { w: s.w, h: s.h, px };
}

/** Travellers, a scholar, a monk, a fisherman: ~11 px tall like the original's figures. */
export const FIGURES: Sprite[] = [
  art(['..hhh..', '.hhhhh.', 'H.....H', '...s...', '..rrr.w', '.rrrrrw', '.rrrrrw', '..rrr.w', '..r.r.w', '..k.k.w']),
  art(['...k...', '..kkk..', '..sss..', '...s...', '..bbb..', '.bbbbb.', '.bbbbb.', '.bbbbb.', '..bbb..', '..k.k..']),
  art(['...s...', '..sss..', '...s...', '..RRR..', '.RRRRRw', '.RRRRRw', '.RRRRRw', '..RRR.w', '..k.k.w']),
  art(['..hhh.....', '.hhhhh...w', '...s....w.', '..rrr..w..', '.rrrrrw...', '.rrrr.....', '..rrr.....', '..r.r.....', '..k.k.....']),
];

/** Boats: 0-2 far (small), 3-5 near (larger), including a sailing junk. */
export const BOATS: Sprite[] = [
  art(['.........hh.....', '........hhhh....', '.........r......', '.w......rrr....w', '.wwwwwwwwwwwwwww', '..WWWWWWWWWWWW..']),
  art(['....ttt.........', '...tTTTt....s...', '...l...l...rr...', '.w.l...l...rr..w', '.wwwwwwwwwwwwwww', '..WWWWWWWWWWWW..']),
  art(['......hhh......w', '.....hhhhh....w.', '......s......w..', '.....rrr....w...', '.w...rrr.......w', '.wwwwwwwwwwwwwww', '..WWWWWWWWWWWW..']),
  art([
    '................hhh...........',
    '...............hhhhh..........',
    '................s.............',
    '....tttttt.....rrr............',
    '...tTTTTTTt...rrrrr...........',
    '...l......l....rrr............',
    '...l......l....r.r............',
    'w..l......l....k.k...........w',
    'Wwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    '.WWWWwwwwwwwwwwwwwwwwwwwWWWWW.',
    '...WWWWWWWWWWWWWWWWWWWWWWWW...',
  ]),
  art([
    '..........llll........',
    '.........lllll........',
    '........hhhhhh........',
    '.......lllllll........',
    '......llllllll........',
    '.....hhhhhhhhh........',
    '....llllllllll........',
    '..........W...........',
    '....W.....W.....hh....',
    '....W.....W.....r.....',
    'Wwwwwwwwwwwwwwwwwwwwww',
    '.WWwwwwwwwwwwwwwwwwWW.',
    '..WWWWWWWWWWWWWWWWWW..',
  ]),
  art([
    '......................hhh...',
    '.....................hhhhh..',
    '..........w...........s.....',
    '..........w..........RRR....',
    '...ttttttww.........RRRRR...',
    '..tTTTTTTTTt.........RRR....',
    '..l..L..L..l.........R.R....',
    'w.l........l.........k.k...w',
    'Wwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    '.WWWWWwwwwwwwwwwwwwwwwWWWWWW.',
    '...WWWWWWWWWWWWWWWWWWWWWWW...',
  ]),
];

function grid(w: number, h: number) {
  const px = new Uint8Array(w * h);
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && x < w && y >= 0 && y < h) px[y * w + x] = c;
  };
  return { px, set };
}

/** A pagoda of `tiers` storeys, narrowing upward, with upturned eaves. */
export function pagoda(tiers: number, base: number): Sprite {
  const tierH = 6;
  const w = base + 6;
  const h = tiers * tierH + 5;
  const { px, set } = grid(w, h);
  const cx = Math.floor(w / 2);
  let y = h - 1;
  for (let k = 0; k < tiers; k++) {
    const ww = Math.max(5, base - k * 2);
    const half = Math.floor(ww / 2);
    // wall: 3 rows, red pillars at the edges, a window in the middle
    for (let r = 0; r < 3; r++) {
      for (let x = cx - half + 1; x <= cx + half - 1; x++) set(x, y - r, r === 1 && Math.abs(x - cx) <= 1 ? S.window : x === cx - half + 1 || x === cx + half - 1 ? RED[0][0] : WALL[0][1]);
    }
    y -= 3;
    // roof: eave line wider than the wall, ends turned up, a lighter top
    const re = half + 2;
    for (let x = cx - re; x <= cx + re; x++) set(x, y, S.tealRoof);
    set(cx - re - 1, y - 1, S.tealRoof);
    set(cx + re + 1, y - 1, S.tealRoof);
    for (let x = cx - re + 1; x <= cx + re - 1; x++) set(x, y - 1, S.tealRoofLight);
    for (let x = cx - re + 3; x <= cx + re - 3; x++) set(x, y - 2, S.tealRoof);
    y -= 3;
  }
  for (let r = 0; r < 4; r++) set(cx, y - r + 1, S.gold);
  set(cx - 1, y, S.gold);
  set(cx + 1, y, S.gold);
  return { w, h, px };
}

/** A small open pavilion of one or two storeys. */
export function pavilion(storeys: number, wide: boolean): Sprite {
  const base = wide ? 13 : 11;
  const w = base + 4;
  const h = storeys * 7 + 2;
  const { px, set } = grid(w, h);
  const cx = Math.floor(w / 2);
  let y = h - 1;
  for (let k = 0; k < storeys; k++) {
    const half = Math.floor((base - k * 2) / 2);
    for (let x = cx - half; x <= cx + half; x++) set(x, y, S.woodDark); // floor
    for (let r = 1; r <= 3; r++) {
      set(cx - half + 1, y - r, RED[0][0]);
      set(cx + half - 1, y - r, RED[0][0]);
      if (k === storeys - 1 && r === 2) set(cx, y - r, S.lantern);
    }
    y -= 4;
    const re = half + 2;
    for (let x = cx - re; x <= cx + re; x++) set(x, y, S.tealRoof);
    set(cx - re, y - 1, S.tealRoof);
    set(cx + re, y - 1, S.tealRoof);
    for (let x = cx - re + 2; x <= cx + re - 2; x++) set(x, y - 1, S.tealRoofLight);
    for (let x = cx - 2; x <= cx + 2; x++) set(x, y - 2, S.tealRoof);
    y -= 3;
  }
  set(cx, y + 1, S.gold);
  return { w, h, px };
}

/** The whimsy-only roof sign: a little red board with gold lettering dots. */
export const SIGN = art(['eeeeeeeee', 'egegggege', 'eeeeeeeee']);

/** Birds, two wing frames. */
export const BIRD = [art(['k...k', '.k.k.', '..k..']), art(['.....', 'kkkkk', '..k..'])];
/** Cranes: white with dark wingtips, bigger, for the near flock. */
export const CRANE = [
  art(['k.......k', '.cc...cc.', '..cccsc..', '....c....']),
  art(['.........', 'kcccccccck', '...cccs...', '....c.....']),
];
