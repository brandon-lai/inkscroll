// Dev tool: build chunks in Node and print them as text.
import { buildConfig, config, GLYPH_CHARS } from '../src/config';
import { buildChunk } from '../src/render/build';

const seed = Number(process.argv[2] ?? 123456);
const first = Number(process.argv[3] ?? 0);
const count = Number(process.argv[4] ?? 2);
const cfg = buildConfig(config);
const grids = [];
for (let i = first; i < first + count; i++) {
  const fg = buildChunk(seed, 'foreground', i, cfg);
  const bg = buildChunk(seed, 'background', Math.floor(i * 0.6), cfg);
  console.error(`chunk ${i}: fg ${fg.buildMs.toFixed(0)}ms ${fg.primCount} prims, bg ${bg.buildMs.toFixed(0)}ms, boats ${fg.boats.length}`);
  grids.push({ fg, bg });
}
const rows = cfg.worldRows;
for (let r = 0; r < rows; r++) {
  let line = '';
  for (const { fg, bg } of grids) {
    for (let c = 0; c < fg.cols; c++) {
      const i = r * fg.cols + c;
      const opaque = fg.flags[i] & 1;
      line += opaque ? GLYPH_CHARS[fg.glyph[i]] : GLYPH_CHARS[bg.glyph[i]];
    }
  }
  console.log(line);
}
