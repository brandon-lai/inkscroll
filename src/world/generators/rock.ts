// Mount.rock from the original: an elliptical boulder with hatching.

import { asLine, loopNoise, poly, type Pt, stroke, texture } from '../draw';
import { noise } from '../noise';
import { rgba, WHITE } from '../primitives';
import { rand } from '../rng';

export function rock(xoff: number, yoff: number, seed: number, args: { hei?: number; wid?: number; tex?: number; sha?: number } = {}): void {
  const hei = args.hei ?? 80;
  const wid = args.wid ?? 100;
  const tex = args.tex ?? 40;
  const sha = args.sha ?? 10;
  const reso = [10, 50];
  const ptlist: Pt[][] = [];
  for (let i = 0; i < reso[0]; i++) {
    ptlist.push([]);
    const nslist: number[] = [];
    for (let j = 0; j < reso[1]; j++) nslist.push(noise(i, j * 0.2, seed));
    loopNoise(nslist);
    for (let j = 0; j < reso[1]; j++) {
      const a = (j / reso[1]) * Math.PI * 2 - Math.PI / 2;
      let l = (wid * hei) / Math.sqrt(Math.pow(hei * Math.cos(a), 2) + Math.pow(wid * Math.sin(a), 2));
      l *= 0.7 + 0.3 * nslist[j];
      const p = 1 - i / reso[0];
      const nx = Math.cos(a) * l * p;
      let ny = -Math.sin(a) * l * p;
      if (Math.PI < a || a < 0) ny *= 0.2;
      ny += hei * (i / reso[0]) * 0.2;
      ptlist[ptlist.length - 1].push([nx, ny]);
    }
  }
  // WHITE BG
  poly(ptlist[0].concat([[0, 0]]), { xof: xoff, yof: yoff, fil: WHITE, str: null });
  // OUTLINE (also the ridgeline in the line map)
  asLine(0.8, () =>
    stroke(
      ptlist[0].map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
      { col: rgba(100, 0.3), noi: 1, wid: 3 },
    ),
  );
  texture(ptlist, {
    xof: xoff,
    yof: yoff,
    tex,
    wid: 3,
    sha,
    col: () => rgba(180, +(0.3 + rand() * 0.3).toFixed(3)),
    dis: () => (rand() > 0.5 ? 0.15 + 0.15 * rand() : 0.85 - 0.15 * rand()),
  });
}
