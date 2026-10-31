// Breathing: a rare swap to a neighbouring ramp glyph of equal tone, held for
// a couple of seconds, then back. Stateless: a per-cell hash decides which
// time windows a cell spends swapped.

import { config, RAMP } from '../config';
import { hash01 } from './field';

const pos = new Int8Array(256).fill(-1);
RAMP.forEach((g, i) => (pos[g] = i));

export function breathe(glyph: number, wc: number, row: number, t: number): number {
  const i = pos[glyph];
  if (i < 0) return glyph;
  const hold = config.breatheHold;
  const phase = hash01(wc, row, 3) * hold;
  const win = Math.floor((t + phase) / hold);
  if (hash01(wc, row, win) >= config.breatheRate * hold) return glyph;
  const j = i === 0 ? 1 : i === RAMP.length - 1 ? i - 1 : hash01(wc, win, 5) < 0.5 ? i - 1 : i + 1;
  return RAMP[j];
}
