// Phase 1 acceptance: per-chunk determinism.
import { describe, expect, it } from 'vitest';
import { buildConfig, config } from '../src/config';
import { buildChunk, clearElementCache, elementsFor, geometry } from '../src/render/build';
import { noiseSeed } from '../src/world/noise';
import { generate, planChunk } from '../src/world/planner';
import type { Primitive } from '../src/world/primitives';

const SEED = 123456;
const cfg = buildConfig(config);

/** Serialise primitives to bytes, so "identical" means byte-identical. */
function bytes(prims: Primitive[]): Uint8Array {
  const parts: number[] = [];
  for (const p of prims) {
    parts.push(['fill', 'stroke', 'line'].indexOf(p.kind), p.ink, p.alpha, p.width, p.material, p.depth, p.points.length);
    for (const v of p.points) parts.push(v);
  }
  return new Uint8Array(new Float64Array(parts).buffer);
}

function chunkPrims(seed: number, index: number): Uint8Array {
  noiseSeed(seed);
  const { cw } = geometry(cfg);
  const els = elementsFor(seed, 'foreground', index, index * cw, (index + 1) * cw, cfg);
  els.sort((a, b) => a.placement.depth - b.placement.depth || a.placement.x - b.placement.x || a.placement.chunk - b.placement.chunk || a.placement.idx - b.placement.idx);
  return bytes(els.flatMap((e) => e.prims));
}

describe('per-chunk determinism', () => {
  it('generating chunk 7 directly gives byte-identical primitives to generating 0..7 in order', () => {
    clearElementCache();
    const direct = chunkPrims(SEED, 7);
    clearElementCache();
    let inOrder = new Uint8Array();
    for (let i = 0; i <= 7; i++) {
      const b = chunkPrims(SEED, i);
      if (i === 7) inOrder = b;
    }
    expect(direct.length).toBeGreaterThan(1000);
    expect(Buffer.from(inOrder).equals(Buffer.from(direct))).toBe(true);
  });

  it('a placement generates identically regardless of what was generated before it', () => {
    noiseSeed(SEED);
    const plan = planChunk(SEED, 3, config);
    expect(plan.length).toBeGreaterThan(0);
    const first = bytes(generate(SEED, plan[0]).prims);
    // Generate a pile of unrelated things in between.
    for (const p of planChunk(SEED, -4, config)) generate(SEED, p);
    noiseSeed(999);
    for (const p of planChunk(999, 1, config)) generate(999, p);
    noiseSeed(SEED);
    expect(Buffer.from(bytes(generate(SEED, plan[0]).prims)).equals(Buffer.from(first))).toBe(true);
  });

  it('scrolling left then right regenerates identical chunks after eviction', () => {
    const grids = (i: number) => {
      const g = buildChunk(SEED, 'foreground', i, cfg);
      return Buffer.concat([g.glyph, g.tone, g.material, g.flags].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
    };
    clearElementCache();
    const before = [2, 3, 4].map(grids);
    // Scroll far left (filling and churning the caches), then come back.
    for (let i = -6; i <= -2; i++) grids(i);
    clearElementCache();
    const after = [4, 3, 2].map(grids).reverse();
    for (let k = 0; k < 3; k++) expect(after[k].equals(before[k])).toBe(true);
  });

  it('the background layer is deterministic too', () => {
    const a = buildChunk(SEED, 'background', 5, cfg);
    clearElementCache();
    const b = buildChunk(SEED, 'background', 5, cfg);
    expect(Buffer.from(a.glyph).equals(Buffer.from(b.glyph))).toBe(true);
  });

  it('different seeds give different worlds', () => {
    const a = buildChunk(1, 'foreground', 0, cfg);
    const b = buildChunk(2, 'foreground', 0, cfg);
    expect(Buffer.from(a.glyph).equals(Buffer.from(b.glyph))).toBe(false);
  });

  it('negative chunks work (the scroll is infinite in both directions)', () => {
    const g = buildChunk(SEED, 'foreground', -37, cfg);
    let inked = 0;
    for (const v of g.glyph) if (v !== 32) inked++;
    expect(inked).toBeGreaterThan(50);
  });
});
