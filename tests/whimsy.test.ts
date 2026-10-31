// Phase 1 acceptance: the whimsy flag gates the original's jokes.
import { describe, expect, it } from 'vitest';
import { collect } from '../src/world/draw';
import { arch02, transmissionTower01 } from '../src/world/generators/arch';
import { noiseSeed } from '../src/world/noise';
import { worldOptions } from '../src/world/options';
import { withRng } from '../src/world/rng';

function pizzaHuts(): number {
  let labels = 0;
  for (let s = 0; s < 300; s++) {
    const got = withRng(s, () => collect('architecture', 0, () => arch02(0, 0, 0, { sto: 1 })));
    labels += got.sprites.filter((x) => x.kind === 'label' && x.text === 'Pizza Hut').length;
  }
  return labels;
}

describe('whimsy flag', () => {
  noiseSeed(1);
  it('off by default: no "Pizza Hut" sign and no transmission towers', () => {
    worldOptions.whimsy = false;
    expect(pizzaHuts()).toBe(0);
    const tower = collect('architecture', 0, () => transmissionTower01(0, 0, 0));
    expect(tower.prims.length).toBe(0);
  });
  it('on: the sign appears on about a third of single-storey houses, and towers draw', () => {
    worldOptions.whimsy = true;
    const n = pizzaHuts();
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(140);
    expect(collect('architecture', 0, () => transmissionTower01(0, 0, 0)).prims.length).toBeGreaterThan(10);
    worldOptions.whimsy = false;
  });
  it('turning whimsy on does not shift anything else', () => {
    worldOptions.whimsy = false;
    const off = withRng(7, () => collect('architecture', 0, () => arch02(0, 0, 0, { sto: 1 })));
    worldOptions.whimsy = true;
    const on = withRng(7, () => collect('architecture', 0, () => arch02(0, 0, 0, { sto: 1 })));
    worldOptions.whimsy = false;
    expect(on.prims.length).toBe(off.prims.length);
    expect(on.prims.every((p, i) => p.points.every((v, k) => v === off.prims[i].points[k]))).toBe(true);
  });
});
