// Mount.distMount from the original: a far range drawn as overlapping
// light-gray triangles. In the port it lives on the parallax background layer.

import { asLine, emitLine, poly, type Pt, triangulate } from '../draw';
import { midPt } from '../draw';
import { noise } from '../noise';
import { rgba } from '../primitives';

export function distMount(xoff: number, yoff: number, seed: number, args: { hei?: number; len?: number; seg?: number } = {}): void {
  const hei = args.hei ?? 300;
  const len = args.len ?? 2000;
  const seg = args.seg ?? 5;
  const span = 10;
  const ptlist: Pt[][] = [];
  for (let i = 0; i < len / span / seg; i++) {
    ptlist.push([]);
    for (let j = 0; j < seg + 1; j++) {
      const k = i * seg + j;
      ptlist[ptlist.length - 1].push([xoff + k * span, yoff - hei * noise(k * 0.05, seed) * Math.pow(Math.sin((Math.PI * k) / (len / span)), 0.5)]);
    }
    for (let j = 0; j < seg / 2 + 1; j++) {
      const k = i * seg + j * 2;
      ptlist[ptlist.length - 1].unshift([xoff + k * span, yoff + 24 * noise(k * 0.05, 2, seed) * Math.pow(Math.sin((Math.PI * k) / (len / span)), 1)]);
    }
  }
  const getCol = (x: number, y: number) => {
    const c = (noise(x * 0.02, y * 0.02, yoff) * 55 + 200) | 0;
    return rgba(c, 1);
  };
  // Not in the original: the crest as a centreline, so a far range reads as a
  // silhouette in the line map rather than a block of light tone.
  const crest: Pt[] = [];
  for (let k = 0; k <= len / span; k++) {
    crest.push([xoff + k * span, yoff - hei * noise(k * 0.05, seed) * Math.pow(Math.sin((Math.PI * k) / (len / span)), 0.5)]);
  }
  for (const pl of ptlist) {
    const last = pl[pl.length - 1];
    poly(pl, { fil: getCol(last[0], last[1]), str: null, wid: 1 });
    const T = triangulate(pl, { area: 100, convex: true, optimize: false });
    for (const t of T) {
      const m = midPt(t);
      const co = getCol(m[0], m[1]);
      poly(t, { fil: co, str: co, wid: 1 });
    }
  }
  asLine(0.75, () => emitLine(crest));
}
