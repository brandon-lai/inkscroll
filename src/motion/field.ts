// Motion noise: its own hash and value noise, independent of the world seed,
// so animation never changes the landscape and the landscape never changes
// how things move.

export function ihash(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 0..1 from integer coordinates. */
export function hash01(a: number, b: number, c = 0): number {
  return ihash(a, b, c) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth 2-D value noise in 0..1. */
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = fade(x - xi),
    yf = fade(y - yi);
  const a = hash01(xi, yi, 7),
    b = hash01(xi + 1, yi, 7),
    c = hash01(xi, yi + 1, 7),
    d = hash01(xi + 1, yi + 1, 7);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
