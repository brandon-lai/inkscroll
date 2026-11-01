// Every tunable number lives here. ?debug=1 edits this object in place;
// anything that changes how chunks are built bumps `version`.

export const config = {
  version: 1,

  // --- pixels -----------------------------------------------------------------
  /** World rows: the original's 0..700 view height drawn as 300 pixel rows. */
  worldPx: 300,
  /** World units per pixel (700 / 300). */
  unitsPerPx: 700 / 300,
  /** Pixels per chunk. 256 px is ~600 world units, close to the original's 512. */
  chunkPx: 256,
  /** Raster samples per pixel per axis (2 = 2x2 supersampling). */
  samples: 2,
  /** On-screen pixel size is an integer scale chosen so about this many rows fill the height. */
  targetRows: 300,
  minScale: 1,
  maxScale: 8,
  whimsy: false,

  // --- world look ---------------------------------------------------------------
  /** Waterline in world units: empty space below it is lake, above it is sky. */
  horizonY: 292,
  /** Structural-line coverage that draws a 1-px ink outline. */
  lineMin: 0.42,
  /** How much hatching ink darkens a surface (shade steps per unit of darkness). */
  inkShade: 9,
  /** Depth (world y) of the nearest and farthest layers, for atmospheric haze. */
  depthNear: 690,
  depthFar: 300,
  /** Reflections reach this many pixels below a shore. */
  reflectPx: 46,
  /** Chance a mountain carries a waterfall. */
  waterfallChance: 0.3,

  // --- scrolling ----------------------------------------------------------------
  /** Parallax of the background (far ranges) and the far silhouettes, relative to the foreground. */
  parallax: 0.5,
  farParallax: 0.22,
  /** Auto-drift in world units per second. */
  driftSpeed: 14,
  wheelGain: 1.0,
  dragInertiaDecay: 3.2,
  arrowStep: 60,
  arrowGlideMax: 900,
  keepViewports: 3,
  aheadViewports: 1.6,
  barIdleMs: 3000,
  urlThrottleMs: 400,

  // --- time and life --------------------------------------------------------------
  /** Seconds for a full day. */
  dayLength: 240,
  /** Time of day a visit starts at (0 midnight, 0.5 noon): golden afternoon, so dusk arrives within a minute. */
  startTime: 0.6,
  motion: {
    water: true,
    clouds: true,
    mist: true,
    boats: true,
    birds: true,
    smoke: true,
    night: true,
    weather: true,
    ripples: true,
    reveal: true,
  },
  boatDrift: 26,
  birdIntervalMin: 14,
  birdIntervalMax: 30,
  weatherEvery: 150,
  revealMs: 1600,
  newPaintingMs: 2000,
};

export type Config = typeof config;

export function unitsPerPx(c: Config = config): number {
  return c.unitsPerPx;
}

export function chunkWidthUnits(c: Pick<Config, 'chunkPx' | 'unitsPerPx'> = config): number {
  return c.chunkPx * c.unitsPerPx;
}

/** The subset of config the worker needs. */
export function buildConfig(c: Config = config) {
  return {
    worldPx: c.worldPx,
    unitsPerPx: c.unitsPerPx,
    chunkPx: c.chunkPx,
    samples: c.samples,
    whimsy: c.whimsy,
    horizonY: c.horizonY,
    lineMin: c.lineMin,
    inkShade: c.inkShade,
    depthNear: c.depthNear,
    depthFar: c.depthFar,
    reflectPx: c.reflectPx,
    waterfallChance: c.waterfallChance,
  };
}
export type BuildConfig = ReturnType<typeof buildConfig>;

export const SEAL = '#B8352A';
export const PAPER = '#F3EEE3';
