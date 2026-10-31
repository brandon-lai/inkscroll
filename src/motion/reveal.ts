// Reveal: cells start as random glyphs and resolve to their target, far
// layers first, foreground (lower rows) last.

import { config, SCRAMBLE } from '../config';
import { hash01 } from './field';

/** Seconds after the reveal starts at which this cell settles. */
export function resolveAt(layerIsBg: boolean, wc: number, row: number, rows: number, span: number): number {
  const j = hash01(wc, row, 11);
  if (layerIsBg) return span * (0.05 + 0.35 * (row / rows) + 0.15 * j);
  return span * (0.3 + 0.5 * (row / rows) + 0.2 * j);
}

/** A scramble glyph that changes every ~90 ms. */
export function scrambleGlyph(wc: number, row: number, t: number, tone: number): number {
  const k = Math.floor(t * 11);
  const h = hash01(wc, row, k);
  // Pick from the part of the scramble set near this tone's density.
  const centre = Math.min(SCRAMBLE.length - 1, Math.floor((tone / 7) * (SCRAMBLE.length - 1)));
  const spread = 6;
  const i = Math.max(0, Math.min(SCRAMBLE.length - 1, centre - spread / 2 + Math.floor(h * spread)));
  return SCRAMBLE[i];
}

export const revealSeconds = () => config.revealMs / 1000;
