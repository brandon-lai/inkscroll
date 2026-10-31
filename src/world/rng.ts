// Seeded randomness. The original overrides Math.random with one global
// stream, so what a chunk contains depends on what was generated before it.
// Here every chunk and every placement gets its own stream keyed by
// hash(seed, ...ids), which is what makes the world order-independent.

/** 32-bit integer hash of a list of numbers (murmur3-style finaliser per item). */
export function hash(...xs: number[]): number {
  let h = 0x9e3779b9 ^ xs.length;
  for (const x of xs) {
    // Fold the float's integer and fractional parts so 0.5 and 1.5 differ.
    const i = Math.floor(x);
    const f = Math.round((x - i) * 1e6);
    h = mix(h ^ (i | 0));
    h = mix(h ^ ((i / 4294967296) | 0));
    h = mix(h ^ f);
  }
  return h >>> 0;
}

function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** sfc32: small, fast, 128-bit state, good statistical quality. */
export function sfc32(seed: number): () => number {
  let a = 0x9e3779b9,
    b = 0x243f6a88,
    c = 0xb7e15162,
    d = seed >>> 0;
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

// The generators are a port of code written against a global Math.random, so
// they read randomness from a module-level stream that callers swap in.
let current: () => number = sfc32(1);

export function rand(): number {
  return current();
}

/** Run fn with a fresh stream seeded from the given ids, restoring the previous one after. */
export function withRng<T>(seed: number, fn: () => T): T {
  const prev = current;
  current = sfc32(seed);
  try {
    return fn();
  } finally {
    current = prev;
  }
}

// --- Util helpers from the original (randChoice, normRand, wtrand, randGaussian)

export function randChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(arr.length * rand())];
}

export function mapval(value: number, istart: number, istop: number, ostart: number, ostop: number): number {
  return ostart + (ostop - ostart) * (((value - istart) * 1.0) / (istop - istart));
}

export function normRand(m: number, M: number): number {
  return mapval(rand(), 0, 1, m, M);
}

/** Rejection sampling against a weight function (the original recurses; a loop is equivalent). */
export function wtrand(func: (x: number) => number): number {
  for (;;) {
    const x = rand();
    const y = rand();
    if (y < func(x)) return x;
  }
}

export function randGaussian(): number {
  return wtrand((x) => Math.pow(Math.E, -24 * Math.pow(x - 0.5, 2))) * 2 - 1;
}
