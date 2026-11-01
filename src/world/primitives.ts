// What the generators emit instead of SVG strings.

export const MATERIALS = [
  'sky',
  'mist',
  'farMountain',
  'mountain',
  'rock',
  'water',
  'foliage',
  'trunk',
  'architecture',
  'figure',
  'boat',
] as const;
export type MaterialId = (typeof MATERIALS)[number];
export const MAT: { [K in MaterialId]: number } = Object.fromEntries(MATERIALS.map((m, i) => [m, i])) as never;

export interface Primitive {
  /**
   * 'fill' and 'stroke' carry ink. 'line' carries none: it is the centreline
   * of an outline the generator marked as structural (ridges, banks, trunks,
   * eaves). It goes into a separate line map so the glyph mapper can draw
   * silhouettes as continuous directional glyphs instead of guessing them
   * from ink, which cannot tell a ridge from the hatching next to it.
   */
  kind: 'fill' | 'stroke' | 'line';
  /** World units, x y x y ... */
  points: Float32Array;
  /** Darkness of the colour, 0 (paper white) .. 1 (black). A fill with ink 0 is an occluder. */
  ink: number;
  /** Opacity, 0..1. The original's colours are rgba(gray, gray, gray, a); this is the a. For 'line', its weight. */
  alpha: number;
  /** Stroke width; on a fill, an outline of this width in the same colour (0 = none). */
  width: number;
  material: number;
  /** Painter's order; higher draws later. */
  depth: number;
}

export type SpriteKind = 'figure' | 'boat' | 'pagoda' | 'pavilion' | 'label' | 'waterfall' | 'smoke';

/** Elements too small to survive rasterising at cell size are placed as hand-drawn sprites. */
export interface SpritePlacement {
  kind: SpriteKind;
  variant: number;
  /** Anchor in world units: horizontal centre, baseline (the row the sprite stands on). */
  x: number;
  y: number;
  depth: number;
  flip: boolean;
  /** Optional free text (the whimsy-only roof sign). */
  text?: string;
}

/** A colour as the original wrote it: gray level (0-255) and alpha. */
export interface Col {
  g: number;
  a: number;
}
export const rgba = (g: number, a: number): Col => ({ g, a });
export const WHITE: Col = { g: 255, a: 1 };
