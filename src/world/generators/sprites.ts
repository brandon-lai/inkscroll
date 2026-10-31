// Hand-drawn ASCII sprites for elements too small to survive rasterising at
// 7x13 px cells: figures, boats, pagodas, small pavilions (birds live in
// motion/birds.ts). Each is anchored where the original generator would have
// drawn the element.
//
// In the art, ' ' is transparent and '@' is opaque blank paper (it hides what
// is behind, e.g. water inside a hull). The art is mirrored for flipped sprites.

import type { SpriteKind } from '../primitives';

export interface SpriteArt {
  lines: string[];
  /** Row of the bottom line relative to the anchor's row (anchor row = floor(y / unitsPerRow)). */
  dy: number;
  /** Ink tone step (0 lightest .. 7 darkest) before depth fading. */
  tone: number;
}

const PAPER = '@';

export const SPRITES: Record<Exclude<SpriteKind, 'label'>, SpriteArt[]> = {
  // Travellers and scholars. The original's figures are ~2.5 rows tall.
  figure: [
    { lines: [' _ ', ' o ', '/A\\'], dy: -1, tone: 6 },
    { lines: ['_^_', ' o)', '/A '], dy: -1, tone: 6 },
    { lines: [' o ', '(A|', ' ^ '], dy: -1, tone: 6 },
    { lines: ['.^.', ' o|', '/A|'], dy: -1, tone: 6 },
  ],
  // Boats: variants 0-2 are far (small), 3-5 near (larger), as boat01 scales with y.
  boat: [
    { lines: ['   o_/', '\\@@@@@/'], dy: 0, tone: 4 },
    { lines: ['  _^_', '\\@@@@@/'], dy: 0, tone: 4 },
    { lines: ['  o  /', ' /A /', '\\@@@@/'], dy: 0, tone: 4 },
    { lines: ['     o   /', '    /A  /', '`-.@@@@@@/', '  `----\''], dy: 0, tone: 5 },
    { lines: ['    ____', ' __/@@@@\\__', ' \\@@@@@@@@/', '  `------\''], dy: 0, tone: 5 },
    { lines: ['       o', '      /|\\', '._____/@|____.', ' \\@@@@@@@@@@/'], dy: 0, tone: 5 },
  ],
  // Pagodas: variant 0 five storeys, 1 seven storeys, 2 a slim five.
  pagoda: [
    { lines: ['   |   ', '  /^\\  ', ' /___\\ ', '  |#|  ', ' /___\\ ', '  |#|  ', '/_____\\', ' |#|#| '], dy: -1, tone: 5 },
    { lines: ['    |    ', '   /^\\   ', '  /___\\  ', '   |#|   ', '  /___\\  ', '   |#|   ', ' /_____\\ ', '  |#|#|  ', '/_______\\', ' |#|#|#| '], dy: -1, tone: 5 },
    { lines: ['  ^  ', ' /_\\ ', ' |#| ', '/___\\', ' |#| ', '/___\\', ' |#| '], dy: -1, tone: 5 },
  ],
  // Small pavilions (arch04): one storey (0, 1) and two storeys (2, 3).
  pavilion: [
    { lines: ['._/^\\_.', ' |@@@| '], dy: -1, tone: 5 },
    { lines: ['_/‾‾‾\\_', ' |@@@| '], dy: -1, tone: 5 },
    { lines: ['  /^\\  ', ' /___\\ ', ' |@@@| ', '/‾‾‾‾‾\\', ' |@@@| '], dy: -1, tone: 5 },
    { lines: ['  _^_  ', ' /@@@\\ ', '/‾‾‾‾‾\\', ' |=@=| '], dy: -1, tone: 5 },
  ],
};

const MIRROR: Record<string, string> = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '`': "'", "'": '`', '[': ']', ']': '[' };

export function artFor(kind: Exclude<SpriteKind, 'label'>, variant: number, flip: boolean): string[] {
  const set = SPRITES[kind];
  const art = set[((variant % set.length) + set.length) % set.length];
  const w = Math.max(...art.lines.map((l) => l.length));
  const padded = art.lines.map((l) => l.padEnd(w, ' '));
  if (!flip) return padded;
  return padded.map((l) =>
    Array.from(l)
      .reverse()
      .map((c) => MIRROR[c] ?? c)
      .join(''),
  );
}

export function spriteMeta(kind: Exclude<SpriteKind, 'label'>, variant: number): SpriteArt {
  const set = SPRITES[kind];
  return set[((variant % set.length) + set.length) % set.length];
}

export const PAPER_CHAR = PAPER;
