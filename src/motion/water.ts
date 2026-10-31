// Water shimmer: water cells step through the water set where a slow noise
// band crosses them. Bands travel left; a given cell changes every few seconds.

import { config, WATER } from '../config';
import { vnoise } from './field';

const pos = new Int8Array(256).fill(-1);
WATER.forEach((g, i) => (pos[g] = i));

export function shimmer(glyph: number, wc: number, row: number, t: number): number {
  const i = pos[glyph];
  if (i < 0) return glyph;
  const n = vnoise(wc * config.waterScale + t * config.waterSpeed * config.waterScale, row * 0.9);
  // Three steps across the noise range: ~one change per cell every 3 s.
  const k = Math.floor(n * 3.2);
  return WATER[(i + k) % WATER.length];
}
