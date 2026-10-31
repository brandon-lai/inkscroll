// Glyph mapper and rasterizer on synthetic input.
import { describe, expect, it } from 'vitest';
import { buildConfig, config, CONTOUR, GLYPH_CHARS, RAMP } from '../src/config';
import { mapCells } from '../src/render/glyphMapper';
import { rasterize } from '../src/render/rasterize';
import { MAT, type Primitive } from '../src/world/primitives';

const cfg = buildConfig(config);
const COLS = 12,
  ROWS = 8,
  SX = cfg.samplesX,
  SY = cfg.samplesY;
const upr = cfg.unitsPerRow,
  upc = (upr * cfg.cell.w) / cfg.cell.h;

function run(prims: Primitive[]) {
  const r = rasterize(prims, -upc, 0, (COLS + 2) * SX, ROWS * SY, upc / SX, upr / SY);
  return { r, m: mapCells(r, COLS, ROWS, SX, SY, cfg, { toneScale: 1, margin: 1 }) };
}
const P = (kind: Primitive['kind'], pts: number[], o: Partial<Primitive> = {}): Primitive => ({
  kind,
  points: new Float32Array(pts),
  ink: 0.6,
  alpha: 1,
  width: 0,
  material: MAT.mountain,
  depth: 0,
  ...o,
});
const W = COLS * upc,
  H = ROWS * upr;

describe('rasterizer', () => {
  it('fills a polygon with nonzero winding and composites alpha like the original', () => {
    const { r } = run([P('fill', [0, 0, W, 0, W, H, 0, H], { ink: 0.6, alpha: 0.5 })]);
    const mid = r.ink[Math.floor(r.h / 2) * r.w + Math.floor(r.w / 2)];
    expect(mid).toBeCloseTo(0.3, 5);
  });
  it('white fills occlude what is behind them, including lines', () => {
    const { r } = run([
      P('fill', [0, 0, W, 0, W, H, 0, H], { ink: 0.6, alpha: 1 }),
      P('line', [0, H / 2, W, H / 2], { alpha: 1, width: 1.4 }),
      P('fill', [0, 0, W / 2, 0, W / 2, H, 0, H], { ink: 0, alpha: 1 }),
    ]);
    const row = Math.floor(r.h / 2) * r.w;
    expect(r.ink[row + 2]).toBe(0);
    expect(r.line[row + 2]).toBe(0);
    expect(r.line[row + r.w - 2 * SX - 2]).toBeGreaterThan(0.5);
  });
});

describe('glyph mapper', () => {
  it('maps darker ink to denser ramp glyphs', () => {
    const glyphs: number[] = [];
    for (const ink of [0.08, 0.2, 0.35, 0.5]) {
      const { m } = run([P('fill', [0, 0, W, 0, W, H, 0, H], { ink, alpha: 1 })]);
      glyphs.push(RAMP.indexOf(m.glyph[(ROWS >> 1) * COLS + (COLS >> 1)]));
    }
    for (let i = 1; i < glyphs.length; i++) expect(glyphs[i]).toBeGreaterThanOrEqual(glyphs[i - 1]);
    expect(glyphs[glyphs.length - 1]).toBeGreaterThan(glyphs[0]);
  });

  it('draws structural lines as directional glyphs', () => {
    const cases: [number[], number[]][] = [
      [[0, H / 2 + 0.2, W, H / 2 + 0.2], [CONTOUR.h, CONTOUR.hLow, CONTOUR.hHigh]],
      [[W / 2 + 1, 0, W / 2 + 1, H], [CONTOUR.v]],
      [[W / 2 - H * 0.3, H, W / 2 + H * 0.3, 0], [CONTOUR.up]],
      [[W / 2 - H * 0.3, 0, W / 2 + H * 0.3, H], [CONTOUR.down]],
    ];
    for (const [pts, want] of cases) {
      const { m } = run([P('line', pts, { alpha: 1, width: 1.4 })]);
      const counts = new Map<number, number>();
      for (const g of m.glyph) if (g !== 32) counts.set(g, (counts.get(g) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      expect(top, `line ${pts}`).toBeDefined();
      expect(want.map((g) => GLYPH_CHARS[g])).toContain(GLYPH_CHARS[top[0]]);
    }
  });

  it('keeps a structural line one glyph thick', () => {
    const { m } = run([P('line', [W / 2 + 1, 0, W / 2 + 1, H], { alpha: 1, width: 3 })]);
    for (let r = 1; r < ROWS - 1; r++) {
      let n = 0;
      for (let c = 0; c < COLS; c++) if (m.glyph[r * COLS + c] !== 32) n++;
      expect(n).toBe(1);
    }
  });

  it('leaves empty paper blank and transparent', () => {
    const { m } = run([]);
    expect(m.glyph.every((g) => g === 32)).toBe(true);
    expect(m.flags.every((f) => f === 0)).toBe(true);
  });

  it('water cells use the water set', () => {
    const { m } = run([P('fill', [0, 0, W, 0, W, H, 0, H], { ink: 0.6, alpha: 0.5, material: MAT.water })]);
    const ch = GLYPH_CHARS[m.glyph[(ROWS >> 1) * COLS + 3]];
    expect('_-~=≈').toContain(ch);
  });
});
