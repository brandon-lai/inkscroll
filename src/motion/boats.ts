// Boats drift a few cells along the water and bob a row on a long sine.

import { config } from '../config';

export function boatOffset(phase: number, t: number): { dx: number; dy: number } {
  if (!config.motion.boats) return { dx: 0, dy: 0 };
  const range = config.boatDriftRange;
  const period = (2 * Math.PI * range) / config.boatDriftCellsPerSec;
  const dx = Math.round(range * Math.sin((2 * Math.PI * t) / period + phase * 6.283));
  const dy = Math.sin((2 * Math.PI * t) / config.boatBobPeriod + phase * 11) > 0.6 ? -1 : 0;
  return { dx, dy };
}
