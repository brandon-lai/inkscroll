// A still ASCII render of part of the world (no motion, no workers), for the
// review pages.

import { buildConfig, config, GLYPH_CHARS, PAPER } from '../config';
import { buildAtlas } from '../render/atlas';
import { buildChunk, type ChunkGrid } from '../render/build';

export function renderStill(canvas: HTMLCanvasElement, seed: number, x: number, cols: number, cellW = 7): void {
  const cfg = buildConfig(config);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(cellW * dpr);
  const ch = Math.round((cw * config.cell.h) / config.cell.w);
  const rows = config.worldRows;
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  canvas.style.width = `${(cols * cw) / dpr}px`;
  const atlas = buildAtlas(cw, ch, GLYPH_CHARS);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const upc = (config.unitsPerRow * config.cell.w) / config.cell.h;
  const cache = new Map<string, ChunkGrid>();
  const cell = (layer: 'foreground' | 'background', wc: number, r: number) => {
    const ci = Math.floor(wc / config.chunkCols);
    const key = `${layer}${ci}`;
    let g = cache.get(key);
    if (!g) cache.set(key, (g = buildChunk(seed, layer, ci, cfg)));
    const i = r * g.cols + (wc - ci * config.chunkCols);
    return { glyph: g.glyph[i], tone: g.tone[i], flags: g.flags[i], boats: g.boats };
  };
  const fg0 = Math.floor(x / upc);
  const bg0 = Math.floor((x * config.parallax) / upc);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      let v = cell('foreground', fg0 + c, r);
      if (!(v.flags & 1)) v = cell('background', bg0 + c, r);
      const s = atlas.slot[v.glyph] >= 0 ? atlas.slot[v.glyph] : atlas.slot[32];
      ctx.drawImage(atlas.canvas, s * cw, v.tone * ch, cw, ch, c * cw, r * ch, cw, ch);
    }
  }
  // Boats, at rest.
  for (const [, g] of cache) {
    if (g.layer !== 'foreground') continue;
    for (const b of g.boats) {
      b.lines.forEach((line, k) => {
        const r = b.row - (b.lines.length - 1 - k);
        for (let i = 0; i < line.length; i++) {
          if (line[i] === ' ') continue;
          const c = b.col + i - fg0;
          if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
          const gi = line[i] === '@' ? 32 : GLYPH_CHARS.indexOf(line[i]);
          ctx.drawImage(atlas.canvas, atlas.slot[gi] * cw, b.tone * ch, cw, ch, c * cw, r * ch, cw, ch);
        }
      });
    }
  }
}
