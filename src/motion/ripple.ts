// Hover ripple: cells near the cursor scramble to glyphs of similar tone,
// then resolve outward over ~400 ms.

import { config } from '../config';

export interface Ripple {
  col: number;
  row: number;
  t0: number;
}

export class Ripples {
  list: Ripple[] = [];
  private lastKey = '';
  add(col: number, row: number, t: number): void {
    const key = `${col},${row}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.list.push({ col, row, t0: t });
    if (this.list.length > 12) this.list.shift();
  }
  prune(t: number): void {
    const life = config.rippleMs / 1000 + 0.05;
    this.list = this.list.filter((r) => t - r.t0 < life);
  }
}
