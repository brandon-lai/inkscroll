// Every tunable number lives here. The ?debug=1 panel edits this object in
// place and bumps `version`; anything that affects chunk building is sent to
// the worker again and the chunk cache is flushed.

export const config = {
  version: 1,

  // --- grid -----------------------------------------------------------------
  /** Cell size in CSS px at desktop scale. The single constant the PRD asks for. */
  cell: { w: 7, h: 13 },
  /** Rows the viewport aims to show; the cell scales so ~this many fit the height. */
  viewRows: 69,
  minScale: 0.72,
  maxScale: 1.6,
  /** On narrow screens the cell grows until the grid is at most this many columns. */
  maxMobileCols: 100,
  mobileBreakpoint: 820,
  dprCap: 2,

  // --- world ----------------------------------------------------------------
  /** World rows: 70 rows of 10 units cover the original's 0..700 view height. */
  worldRows: 70,
  unitsPerRow: 10,
  /** Columns per chunk. 96 cols x 5.38 units ~ the original's 512-unit chunk. */
  chunkCols: 96,
  /** Raster samples per cell. 4x8 rather than 4x4: cells are 7x13, so 8 rows
   *  of samples keeps them roughly square and catches the original's 1-2
   *  unit hairlines that 4 rows would drop as dashes. */
  samplesX: 4,
  samplesY: 8,
  /** Background (far mountains + mist) scroll speed relative to foreground. */
  parallax: 0.6,
  whimsy: false,

  // --- glyph mapper ---------------------------------------------------------
  /** Darkness at which the tone ramp tops out (gray 100 at full alpha is 0.61). */
  inkMax: 0.5,
  inkGamma: 1.3,
  /** Cells below this mean darkness are blank paper. */
  inkFloor: 0.03,
  /** Sobel magnitude (darkness per world unit) for a sample to count as edge. */
  edgeMag: 0.05,
  /** Fraction of a cell's samples that must be edge samples for a contour glyph. */
  edgeFrac: 0.22,
  /** Share of edge samples that must agree on one direction. */
  edgeAgree: 0.5,
  /** Contour cells need at least this much ink, so faint hatching stays tonal. */
  edgeInkMin: 0.05,
  /** Structural-line coverage at which a cell draws a ridge glyph. */
  lineMin: 0.5,
  /** How much a ridge's tone comes from the line (vs the cell's ink). */
  ridgeTone: 0.8,
  /** Contour glyphs need this many continuing neighbours along the line. */
  edgeLinks: 2,
  /** Tone floor for contour glyphs (0..1), so lines read over tone. */
  lineTone: 0.6,
  /** Lighter ink with distance: tone scales from depthFade at depthFar to 1 at depthNear (world y). */
  depthFar: 300,
  depthNear: 680,
  depthFade: 0.55,
  dither: 0.55,
  tones: 8,

  // --- motion ---------------------------------------------------------------
  motion: {
    water: true,
    mist: true,
    sway: true,
    breathe: true,
    boats: true,
    birds: true,
    ripple: true,
    reveal: true,
  },
  /** Water bands travel left at this many columns per second. */
  waterSpeed: 0.32,
  waterScale: 0.11,
  /** Mist band crosses one screen in about this many seconds. */
  mistCrossSeconds: 90,
  mistThreshold: 0.64,
  swaySpeed: 0.05,
  swayThreshold: 0.86,
  /** Breathing: chance per cell per second of a swap (each swap returns after breatheHold). */
  breatheRate: 0.0016,
  breatheHold: 2.6,
  boatDriftCellsPerSec: 1 / 3,
  boatDriftRange: 4,
  boatBobPeriod: 7,
  birdIntervalMin: 20,
  birdIntervalMax: 40,
  birdFlapPeriod: 2.4,
  rippleRadius: 6,
  rippleMs: 400,
  revealMs: 1500,
  newPaintingMs: 2000,

  // --- scrolling ------------------------------------------------------------
  /** Auto-drift in world units per second (about 2 columns a second). */
  driftSpeed: 11,
  wheelGain: 1.0,
  dragInertiaDecay: 3.2,
  arrowStep: 54,
  arrowGlideMax: 900,
  /** Chunks kept around the view, in viewport widths. */
  keepViewports: 3,
  /** Chunks pre-built ahead of the view in the scroll direction, in viewport widths. */
  aheadViewports: 1.6,
  barIdleMs: 3000,
  urlThrottleMs: 400,
};

export type Config = typeof config;

/** World units per column follow from the cell aspect, so glyph shapes keep world proportions. */
export function unitsPerCol(c: Config = config): number {
  return (c.unitsPerRow * c.cell.w) / c.cell.h;
}

export function chunkWidthUnits(c: Config = config): number {
  return c.chunkCols * unitsPerCol(c);
}

/** The subset of config the worker needs; sent with every rebuild. */
export function buildConfig(c: Config = config) {
  return {
    cell: c.cell,
    worldRows: c.worldRows,
    unitsPerRow: c.unitsPerRow,
    chunkCols: c.chunkCols,
    samplesX: c.samplesX,
    samplesY: c.samplesY,
    whimsy: c.whimsy,
    inkMax: c.inkMax,
    inkGamma: c.inkGamma,
    inkFloor: c.inkFloor,
    edgeMag: c.edgeMag,
    edgeFrac: c.edgeFrac,
    edgeAgree: c.edgeAgree,
    edgeInkMin: c.edgeInkMin,
    edgeLinks: c.edgeLinks,
    lineMin: c.lineMin,
    ridgeTone: c.ridgeTone,
    lineTone: c.lineTone,
    depthFar: c.depthFar,
    depthNear: c.depthNear,
    depthFade: c.depthFade,
    dither: c.dither,
    tones: c.tones,
  };
}

export type BuildConfig = ReturnType<typeof buildConfig>;

// --- palette ----------------------------------------------------------------
export const PAPER = '#F3EEE3';
export const INK = '#2B2926';
export const SEAL = '#B8352A';
/** Opacity of the ink at each tone step, lightest to darkest. */
export const TONE_ALPHA = [0.15, 0.25, 0.36, 0.48, 0.6, 0.66, 0.78, 0.92];

// --- character sets -----------------------------------------------------------
// Glyph indices are char codes for printable ASCII; the few non-ASCII glyphs
// take slots from 128 up. One Uint8 per cell indexes this table.
export const EXTRA_GLYPHS = ['‾', '≈', '·', '¥', '°', '×'];
export const GLYPH_CHARS: string[] = (() => {
  const t: string[] = new Array(256).fill(' ');
  for (let i = 32; i < 127; i++) t[i] = String.fromCharCode(i);
  EXTRA_GLYPHS.forEach((g, i) => (t[128 + i] = g));
  return t;
})();
export function glyphIndex(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c < 127) return c;
  const k = EXTRA_GLYPHS.indexOf(ch);
  return k >= 0 ? 128 + k : 32;
}
const idx = (s: string) => Array.from(s).map(glyphIndex);

/** Tone ramp, light to dark; a blank cell is lighter than all of them. */
export const RAMP = idx(".',:;~-=+*x%#@");
/** Contour glyphs by edge direction. */
export const CONTOUR = {
  h: glyphIndex('-'),
  hLow: glyphIndex('_'),
  hHigh: glyphIndex('‾'),
  v: glyphIndex('|'),
  up: glyphIndex('/'),
  down: glyphIndex('\\'),
  lean: glyphIndex('('),
  leanBack: glyphIndex(')'),
};
/** Water, light to dark; shimmer cycles within it. */
export const WATER = idx('_-~=≈');
/** Foliage, light to dark. ♣ from the PRD's list is in neither candidate font. */
export const FOLIAGE = idx("'^*¥%&");
/** Mist, light to dark. */
export const MIST = idx(".·'");
/** Glyphs used while scrambling (reveal, ripple, new painting), light to dark. */
export const SCRAMBLE = idx(".',:;~-=+*x%#@/\\|_^&¥≈");
export const BLANK = 32;
