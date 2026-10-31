// Glyph atlas: every glyph at every tone step, pre-rendered once on paper, so
// drawing a cell is a single drawImage. Rebuilt on DPR or cell-size change.

import { EXTRA_GLYPHS, INK, PAPER, TONE_ALPHA } from '../config';

export const FONT_FAMILY = '"JetBrains Mono", ui-monospace, Menlo, monospace';

export interface Atlas {
  canvas: HTMLCanvasElement;
  /** Cell size in device pixels (integers, so cells tile without seams). */
  cw: number;
  ch: number;
  /** Column in the atlas for each glyph index (-1 if not present). */
  slot: Int16Array;
  tones: number;
}

export function glyphList(): number[] {
  const out: number[] = [];
  for (let i = 32; i < 127; i++) out.push(i);
  for (let i = 0; i < EXTRA_GLYPHS.length; i++) out.push(128 + i);
  return out;
}

export function fontPx(cw: number, ch: number): number {
  // JetBrains Mono advances 0.6em; size to the cell width, capped by height.
  return Math.min(cw / 0.6, ch * 0.92);
}

export function drawGlyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, cw: number, chh: number): void {
  ctx.fillText(ch, x + cw / 2, y + chh * 0.53);
}

export function buildAtlas(cw: number, ch: number, glyphChars: string[]): Atlas {
  const glyphs = glyphList();
  const tones = TONE_ALPHA.length;
  const canvas = document.createElement('canvas');
  canvas.width = glyphs.length * cw;
  canvas.height = tones * ch;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontPx(cw, ch)}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  const slot = new Int16Array(256).fill(-1);
  glyphs.forEach((g, i) => {
    slot[g] = i;
    for (let t = 0; t < tones; t++) {
      ctx.globalAlpha = TONE_ALPHA[t];
      drawGlyph(ctx, glyphChars[g], i * cw, t * ch, cw, ch);
    }
  });
  ctx.globalAlpha = 1;
  return { canvas, cw, ch, slot, tones };
}
