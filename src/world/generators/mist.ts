// Mist bands: not in the original. Soft, noise-edged horizontal bands of
// semi-opaque paper drawn between depth layers, so the feet of farther
// mountains dissolve before nearer ones start. In ASCII this sells depth far
// better than gray levels alone, which the grid quantises away.
//
// Bands are a pure function of world x, so a band crossing a chunk border is
// continuous: each chunk draws the part of every band that falls inside it.

import { poly, type Pt } from '../draw';
import { noise } from '../noise';
import { rgba } from '../primitives';

export interface MistLevel {
  /** Painter's depth: drawn over everything planted at a smaller y. */
  depth: number;
  /** Band centre in world y. */
  y: number;
  /** Maximum half-thickness in world units. */
  thick: number;
  alpha: number;
}

export const FOREGROUND_MIST: MistLevel[] = [
  { depth: 395, y: 355, thick: 30, alpha: 0.3 },
  { depth: 485, y: 440, thick: 36, alpha: 0.32 },
  { depth: 575, y: 530, thick: 40, alpha: 0.32 },
  { depth: 665, y: 625, thick: 34, alpha: 0.3 },
];

export const BACKGROUND_MIST: MistLevel[] = [{ depth: 2000, y: 262, thick: 26, alpha: 0.34 }];

const STEP = 8;
const LAYERS = 3;

/** Draw every band's span over [x0, x1). */
export function mistBands(levels: MistLevel[], x0: number, x1: number, k0 = 0): void {
  levels.forEach((lv, k) => {
    const kk = k + k0;
    const start = Math.floor(x0 / STEP) * STEP - STEP;
    const end = Math.ceil(x1 / STEP) * STEP + STEP;
    for (let layer = 0; layer < LAYERS; layer++) {
      const frac = 1 - layer / LAYERS;
      const top: Pt[] = [];
      const bot: Pt[] = [];
      for (let x = start; x <= end; x += STEP) {
        const yc = lv.y + (noise(x * 0.0035, kk * 7.31 + 11) - 0.5) * 50;
        // Presence: bands thin out and vanish along x, so mist comes in banks.
        const pres = smooth((noise(x * 0.0021, kk * 3.17 + 50) - 0.38) / 0.24);
        const t = lv.thick * pres * frac * (0.75 + 0.5 * noise(x * 0.02, kk + 90));
        const skew = (noise(x * 0.01, kk + 130) - 0.5) * 10;
        top.push([x, yc - t + skew]);
        bot.push([x, yc + t * 0.55 + skew]);
      }
      poly(top.concat(bot.reverse()), { fil: rgba(255, lv.alpha), str: null });
    }
  });
}

function smooth(v: number): number {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
}
