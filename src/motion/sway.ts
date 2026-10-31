// Foliage sway: where a slow wind field crosses a threshold, a foliage glyph
// shifts one step within its set. Well under 1% of foliage cells at a time.

import { config, FOLIAGE } from '../config';
import { vnoise } from './field';

const pos = new Int8Array(256).fill(-1);
FOLIAGE.forEach((g, i) => (pos[g] = i));

export function sway(glyph: number, wc: number, row: number, t: number): number {
  const i = pos[glyph];
  if (i < 0) return glyph;
  const w = vnoise(wc * 0.09 - t * config.swaySpeed * 6, row * 0.21 + t * 0.03);
  if (w < config.swayThreshold) return glyph;
  return FOLIAGE[i === FOLIAGE.length - 1 ? i - 1 : i + 1];
}
