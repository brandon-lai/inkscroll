// The palette: every colour a chunk can contain, as indexed ramps, in the
// Chinese blue-green landscape style (青绿山水: azurite peaks over malachite
// slopes over ochre feet). Chunks store indices; the scene grades the
// palette for the time of day every frame and cycles the water entries, so a
// whole landscape changes light without rebuilding a single chunk.

export type RGB = [number, number, number];

export interface Entry {
  rgb: RGB;
  /** Glows at night (lit windows, lanterns): night colour and strength. */
  glow?: RGB;
  /** Colour-cycled group and phase (water sparkle, waterfalls). */
  cycle?: 'sparkle' | 'fall';
  phase?: number;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round) as RGB;

export const ENTRIES: Entry[] = [{ rgb: [0, 0, 0] }]; // 0 = transparent
const add = (e: Entry) => ENTRIES.push(e) - 1;

/** Haze: farther things lean toward the colour of air. */
export const HAZE_LEVELS = 4;
const HAZE: RGB = hex('#b9cfdc');
const HAZE_T = [0, 0.2, 0.38, 0.56];

function hazedRamp(colors: string[]): number[][] {
  // [haze][shade] -> index
  return HAZE_T.map((h) => colors.map((c) => add({ rgb: mix(hex(c), HAZE, h) })));
}

/** Mountain hues, foot to peak: ochre earth, malachite green, teal, azurite blue. Shades light to dark. */
export const MTN_HUES = 4;
export const MTN_SHADES = 5;
export const MTN: number[][][] = [
  ['#dccb9c', '#c2aa78', '#9d8457', '#77613e', '#52422a'],
  ['#a6d08c', '#6fb173', '#4c9064', '#357052', '#224f3d'],
  ['#8ccdc0', '#56aba3', '#3a8a8f', '#2a6a76', '#1b4b5b'],
  ['#8eb2e0', '#6290cf', '#4a70b6', '#36559a', '#253c74'],
].map((h) => hazedRamp(h));
/** MTN[hue][haze][shade] */

export const FOL = hazedRamp(['#94bb6c', '#629753', '#407544', '#2a5634', '#1b3b26']);
export const ROCK = hazedRamp(['#bdb4a2', '#968c7a', '#706759', '#4c463c']);
export const TRUNK = hazedRamp(['#8a6a4a', '#634b34', '#3f2f22']);
export const WALL = hazedRamp(['#efe5cb', '#d8ccae']);
export const ROOF = hazedRamp(['#4b5868', '#323c4a']);
export const RED = hazedRamp(['#b8402f']);
export const INK = hazedRamp(['#1e2a2d']);
export const WINDOW = add({ rgb: hex('#5d4b38'), glow: hex('#ffd27a') });

/** Far ranges on the background layer, light to dark, plus their crest line. */
export const FAR = ['#b7c9da', '#a6bbd0', '#95adc6', '#859fbb', '#7690b0'].map((c) => add({ rgb: hex(c) }));
export const FAR_INK = add({ rgb: hex('#6a83a6') });
/** The farthest silhouettes, painted by the scene. */
export const FAR_SIL = [add({ rgb: hex('#c6d6e2') }), add({ rgb: hex('#b8cadb') })];

/** Lake, deep to light; a light streak; reflections of land, light to dark. */
export const WATER = ['#1d475b', '#275a70', '#316d86', '#40819c', '#5797b0', '#7db5c6'].map((c) => add({ rgb: hex(c) }));
export const WATER_LINE = add({ rgb: hex('#a8d2db') });
export const REFL = ['#4f817f', '#3c6d6e', '#2d5a5f', '#22494f', '#18383f'].map((c) => add({ rgb: hex(c) }));
export const SPARKLE = [0, 1, 2, 3].map((p) => add({ rgb: hex('#5797b0'), cycle: 'sparkle', phase: p }));
export const FALL = [0, 1, 2, 3].map((p) => add({ rgb: hex('#d6eef0'), cycle: 'fall', phase: p }));
export const SPRAY = [add({ rgb: hex('#eef5f3') }), add({ rgb: hex('#d6e6e6') })];

/** Sprite colours. */
export const S = {
  skin: add({ rgb: hex('#e0b48c') }),
  robe: add({ rgb: hex('#d8cfb7') }),
  robeBlue: add({ rgb: hex('#56798b') }),
  robeRed: add({ rgb: hex('#9a3d2f') }),
  hat: add({ rgb: hex('#c9a76a') }),
  hatDark: add({ rgb: hex('#8a6d3e') }),
  black: add({ rgb: hex('#25272b') }),
  wood: add({ rgb: hex('#6d4c30') }),
  woodDark: add({ rgb: hex('#45301e') }),
  sail: add({ rgb: hex('#e6dec6') }),
  gold: add({ rgb: hex('#d9a441') }),
  tealRoof: add({ rgb: hex('#2f6b6a') }),
  tealRoofLight: add({ rgb: hex('#4f9285') }),
  wall: WALL[0][0],
  red: RED[0][0],
  window: WINDOW,
  lantern: add({ rgb: hex('#d0703a'), glow: hex('#ffb257') }),
};

export const PALETTE_SIZE = ENTRIES.length;
if (PALETTE_SIZE > 255) throw new Error(`palette too large: ${PALETTE_SIZE}`);

/** 4x4 Bayer matrix, values 0..15 / 16 + 1/32. Ordered dithering is the pixel-art texture. */
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
}

/**
 * Quantise v (continuous, in steps) to an integer step. Ordered dithering
 * only in a narrow seam between steps: flat areas stay flat and the seams
 * get the checker, which is how pixel artists use dither (dithering
 * everything reads as a screen door).
 */
export function dither(v: number, x: number, y: number, band = 0.34): number {
  const f = Math.floor(v);
  const r = v - f;
  const lo = 0.5 - band / 2;
  if (r <= lo) return f;
  if (r >= lo + band) return f + 1;
  return (r - lo) / band > bayer(x, y) ? f + 1 : f;
}
