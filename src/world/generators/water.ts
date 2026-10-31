// water() from the original: a cluster of faint horizontal ripple strokes
// drawn behind each mountain (the original paints it at y - 10000).

import { type Pt, stroke } from '../draw';
import { noise } from '../noise';
import { rgba } from '../primitives';
import { rand } from '../rng';

export function water(xoff: number, yoff: number, seed: number, args: { hei?: number; len?: number; clu?: number } = {}): void {
  const hei = args.hei ?? 2;
  const len = args.len ?? 800;
  const clu = args.clu ?? 10;
  const ptlist: Pt[][] = [];
  let yk = 0;
  for (let i = 0; i < clu; i++) {
    ptlist.push([]);
    const xk = (rand() - 0.5) * (len / 8);
    yk += rand() * 5;
    const lk = len / 4 + rand() * (len / 4);
    const reso = 5;
    for (let j = -lk; j < lk; j += reso) {
      ptlist[ptlist.length - 1].push([j + xk, Math.sin(j * 0.2) * hei * noise(j * 0.1) - 20 + yk]);
    }
  }
  for (let j = 1; j < ptlist.length; j += 1) {
    stroke(
      ptlist[j].map((x) => [x[0] + xoff, x[1] + yoff] as Pt),
      { col: rgba(100, +(0.3 + rand() * 0.3).toFixed(3)), wid: 1 },
    );
  }
  void seed;
}
