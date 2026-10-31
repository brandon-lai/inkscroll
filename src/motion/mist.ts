// Mist drift: a soft noise band moving horizontally through mist cells
// (raising or lowering their tone a step) and through the sky above the far
// mountains (where it leaves a few faint dots). Crosses a screen in ~90 s.

import { config, MIST } from '../config';
import { vnoise } from './field';

export function mistBand(wc: number, row: number, t: number, screenCols: number): number {
  const speed = screenCols / config.mistCrossSeconds;
  return vnoise((wc - t * speed) * 0.035, row * 0.22);
}

/** Tone change for a mist cell: -1, 0 or +1. */
export function mistTone(wc: number, row: number, t: number, screenCols: number): number {
  const b = mistBand(wc, row, t, screenCols);
  if (b > config.mistThreshold) return 1;
  if (b < 1 - config.mistThreshold - 0.08) return -1;
  return 0;
}

/** A faint mist glyph for empty sky in the drifting band, or -1. */
export function skyMist(wc: number, row: number, t: number, screenCols: number): number {
  const b = mistBand(wc, row, t, screenCols);
  const over = b - (config.mistThreshold + 0.12);
  if (over <= 0) return -1;
  // Sparse: only some cells inside the band, chosen by a fixed per-cell hash.
  const h = Math.sin(wc * 12.9898 + row * 78.233) * 43758.5453;
  const f = h - Math.floor(h);
  return f < over * 1.6 ? MIST[f < over * 0.5 ? 1 : 0] : -1;
}
