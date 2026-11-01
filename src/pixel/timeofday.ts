// Time of day: keyframed grading for the palette and the sky. t runs 0..1
// (0 midnight, 0.25 dawn, 0.5 noon, 0.75 sunset).

import type { RGB } from './palette';

interface Key {
  t: number;
  mul: RGB;
  add: RGB;
  sat: number;
  sky: [string, string, string];
}

const KEYS: Key[] = [
  { t: 0.0, mul: [0.3, 0.36, 0.6], add: [4, 6, 20], sat: 0.55, sky: ['#070b1e', '#111a38', '#223159'] },
  { t: 0.2, mul: [0.3, 0.36, 0.6], add: [4, 6, 20], sat: 0.55, sky: ['#070b1e', '#111a38', '#223159'] },
  { t: 0.25, mul: [0.86, 0.72, 0.78], add: [30, 10, 22], sat: 0.8, sky: ['#36457a', '#c3849a', '#f6bb8a'] },
  { t: 0.31, mul: [1, 0.97, 0.94], add: [6, 4, 0], sat: 1, sky: ['#6fa2d6', '#a9cce6', '#e6eeee'] },
  { t: 0.5, mul: [1, 1, 1], add: [0, 0, 0], sat: 1, sky: ['#5c99d6', '#9ccaec', '#dcebef'] },
  { t: 0.62, mul: [1.04, 0.97, 0.87], add: [10, 6, 0], sat: 1.05, sky: ['#6a9bd0', '#b5d1e4', '#f2e5cc'] },
  { t: 0.7, mul: [1.08, 0.87, 0.7], add: [26, 10, 0], sat: 1.12, sky: ['#6a82b6', '#e3b88d', '#f8ce86'] },
  { t: 0.755, mul: [0.92, 0.62, 0.6], add: [32, 6, 18], sat: 1.05, sky: ['#47498a', '#dc7a68', '#f7a55a'] },
  { t: 0.8, mul: [0.52, 0.48, 0.72], add: [12, 6, 26], sat: 0.75, sky: ['#1d2858', '#5b4a7c', '#b0707c'] },
  { t: 0.86, mul: [0.3, 0.36, 0.6], add: [4, 6, 20], sat: 0.55, sky: ['#070b1e', '#111a38', '#223159'] },
  { t: 1.0, mul: [0.3, 0.36, 0.6], add: [4, 6, 20], sat: 0.55, sky: ['#070b1e', '#111a38', '#223159'] },
];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const SKY = KEYS.map((k) => k.sky.map(hex));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export interface Light {
  t: number;
  mul: RGB;
  add: RGB;
  sat: number;
  /** Sky colours: zenith, middle, horizon. */
  sky: [RGB, RGB, RGB];
  /** 0 by day, 1 in deep night: windows and lanterns glow, stars show. */
  night: number;
  /** Sun and moon height above the horizon (-1..1) and across the sky (0..1). */
  sun: { x: number; h: number };
  moon: { x: number; h: number };
  /** Name of the phase, for the bar. */
  phase: 'night' | 'dawn' | 'day' | 'golden hour' | 'sunset' | 'dusk';
}

export function lightAt(tRaw: number, rain = 0): Light {
  const t = ((tRaw % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i],
    b = KEYS[i + 1];
  const f = (t - a.t) / (b.t - a.t || 1);
  const s = f * f * (3 - 2 * f);
  const mul = lerp3(a.mul, b.mul, s);
  const add = lerp3(a.add, b.add, s);
  let sat = lerp(a.sat, b.sat, s);
  const sky = [0, 1, 2].map((k) => lerp3(SKY[i][k], SKY[i + 1][k], s)) as [RGB, RGB, RGB];
  if (rain > 0) {
    // Overcast: flatter, grayer, a little darker.
    const g = rain * 0.55;
    for (let k = 0; k < 3; k++) {
      mul[k] = lerp(mul[k], mul[k] * 0.78, g);
      for (const c of sky) c[k] = lerp(c[k], (c[0] + c[1] + c[2]) / 3 * 0.85, g);
    }
    sat = lerp(sat, sat * 0.6, g);
  }
  const night = t < 0.2 || t > 0.84 ? 1 : t < 0.27 ? 1 - (t - 0.2) / 0.07 : t > 0.76 ? (t - 0.76) / 0.08 : 0;
  // Sun rises at 0.24, sets at 0.77; the moon takes the other half.
  const sunP = (t - 0.24) / 0.53;
  const moonT = (t + 0.5) % 1;
  const moonP = (moonT - 0.24) / 0.53;
  const phase = t < 0.21 || t > 0.83 ? 'night' : t < 0.3 ? 'dawn' : t < 0.66 ? 'day' : t < 0.735 ? 'golden hour' : t < 0.78 ? 'sunset' : 'dusk';
  return {
    t,
    mul,
    add,
    sat,
    sky,
    night,
    sun: { x: sunP, h: Math.sin(sunP * Math.PI) },
    moon: { x: moonP, h: Math.sin(moonP * Math.PI) },
    phase,
  };
}

/** Grade one colour for the light. */
export function grade(c: RGB, L: Light, out: RGB = [0, 0, 0]): RGB {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  for (let k = 0; k < 3; k++) out[k] = Math.max(0, Math.min(255, (l + (c[k] - l) * L.sat) * L.mul[k] + L.add[k]));
  return out;
}
