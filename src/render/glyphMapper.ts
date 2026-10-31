// Glyph mapper: the look is decided here.
//
// Per cell: mean darkness, and a vote among the cell's samples on edge
// direction (Sobel over the sample grid, so edges see across cell borders).
// Cells where enough samples agree on a direction become contour glyphs;
// shallow edges pick _ - or ‾ by where the line sits in the cell, which turns
// a gently rising ridge into a continuous _-‾ run instead of a staircase of
// slashes. Everything else is tone: the ramp by darkness, with error
// diffusion across cells so smooth gradients do not band. Water, foliage and
// mist swap in their own sets.

import { BLANK, type BuildConfig, CONTOUR, FOLIAGE, MIST, RAMP, WATER } from '../config';
import { MAT } from '../world/primitives';
import type { Raster } from './rasterize';

export interface CellMaps {
  glyph: Uint8Array;
  tone: Uint8Array;
  material: Uint8Array;
  /** Mean darkness scaled to 0..255 (debug ink view, scramble tone). */
  ink: Uint8Array;
  /** Occlusion depth for moving sprites; -32768 where nothing opaque. */
  depth: Int16Array;
  /** bit 0: opaque (hides the background layer); bit 1: contour cell. */
  flags: Uint8Array;
}

export const FLAG_OPAQUE = 1;
export const FLAG_CONTOUR = 2;

/** Edge direction bins: 0 horizontal, 1 rising (/), 2 vertical, 3 falling (\). */
function dirBin(gx: number, gy: number): number {
  // Edge tangent is the gradient turned 90 degrees; measure its angle with
  // y up (screen y runs down), folded to 0..180.
  let a = (Math.atan2(-gx, -gy) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  if (a < 30 || a >= 150) return 0;
  if (a < 70) return 1;
  if (a < 110) return 2;
  return 3;
}

/** Bin a line direction (radians, [0, pi), y up) like dirBin does for gradients. */
function angleBin(a: number): number {
  const d = (a * 180) / Math.PI;
  if (d < 30 || d >= 150) return 0;
  if (d < 70) return 1;
  if (d < 110) return 2;
  return 3;
}

/** Horizontal edges pick _ - or ‾ by where the line sits in the cell. */
function contourGlyph(b: number, y: number): number {
  if (b === 0) return y > 0.68 ? CONTOUR.hLow : y < 0.3 ? CONTOUR.hHigh : CONTOUR.h;
  if (b === 1) return CONTOUR.up;
  if (b === 2) return CONTOUR.v;
  return CONTOUR.down;
}

export function mapCells(r: Raster, cols: number, rows: number, sx: number, sy: number, cfg: BuildConfig, opts: { toneScale: number; margin: number }): CellMaps {
  const n = cols * rows;
  const out: CellMaps = {
    glyph: new Uint8Array(n).fill(BLANK),
    tone: new Uint8Array(n),
    material: new Uint8Array(n),
    ink: new Uint8Array(n),
    depth: new Int16Array(n).fill(-32768),
    flags: new Uint8Array(n),
  };
  const W = r.w,
    H = r.h;
  const ink = r.ink;

  // Sobel over the whole sample grid, in darkness per world unit.
  const gx = new Float32Array(W * H);
  const gy = new Float32Array(W * H);
  const at = (i: number, j: number) => ink[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
  const kx = 1 / (8 * r.dx),
    ky = 1 / (8 * r.dy);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const a = at(i - 1, j - 1),
        b = at(i, j - 1),
        c = at(i + 1, j - 1),
        d = at(i - 1, j),
        f = at(i + 1, j),
        g = at(i - 1, j + 1),
        h = at(i, j + 1),
        k = at(i + 1, j + 1);
      gx[j * W + i] = (c + 2 * f + k - (a + 2 * d + g)) * kx;
      gy[j * W + i] = (g + 2 * h + k - (a + 2 * b + c)) * ky;
    }
  }

  const ns = sx * sy;
  const tones = cfg.tones;
  const toneOf = (v: number) => Math.max(0, Math.min(tones - 1, Math.round(v * opts.toneScale * (tones - 1))));

  // Pass 1: per-cell statistics.
  const mean = new Float32Array(n);
  const peak = new Float32Array(n);
  const cand = new Int8Array(n).fill(-1); // contour direction bin, or -1
  const strength = new Float32Array(n);
  const yc = new Float32Array(n);
  const matCount = new Int32Array(16);
  const bins = new Int32Array(4);
  const binS = new Float32Array(4);
  const binY = new Float32Array(4);
  const binW = new Float32Array(4);
  const lineMax = new Float32Array(n);
  const lineSum = new Float32Array(n);
  const lineAngle = new Float32Array(n);
  const lineY = new Float32Array(n);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ci = row * cols + col;
      const si0 = (col + opts.margin) * sx;
      const sj0 = row * sy;
      let lmax = 0,
        lsum = 0,
        lc = 0,
        ls = 0,
        ly = 0;
      let sum = 0,
        mx = 0,
        osum = 0,
        dmax = -Infinity,
        edges = 0;
      matCount.fill(0);
      bins.fill(0);
      binS.fill(0);
      binY.fill(0);
      binW.fill(0);
      for (let j = 0; j < sy; j++) {
        const rowIdx = (sj0 + j) * W;
        for (let i = 0; i < sx; i++) {
          const idx = rowIdx + si0 + i;
          const v = ink[idx];
          sum += v;
          if (v > mx) mx = v;
          osum += r.opa[idx];
          if (r.depth[idx] > dmax) dmax = r.depth[idx];
          const m = r.mat[idx];
          if (m !== 0) matCount[m]++;
          const lv = r.line[idx];
          if (lv > 0.05) {
            if (lv > lmax) lmax = lv;
            lsum += lv;
            // Average direction on the doubled angle, so 179 and 1 degrees agree.
            lc += lv * Math.cos(2 * r.lineAng[idx]);
            ls += lv * Math.sin(2 * r.lineAng[idx]);
            ly += lv * (j + 0.5);
          }
          const ggx = gx[idx],
            ggy = gy[idx];
          const mag = Math.sqrt(ggx * ggx + ggy * ggy);
          if (mag > cfg.edgeMag) {
            const b = dirBin(ggx, ggy);
            bins[b]++;
            binS[b] += mag;
            edges++;
            binY[b] += (j + 0.5) * v;
            binW[b] += v;
          }
        }
      }
      lineMax[ci] = lmax;
      lineSum[ci] = lsum;
      if (lsum > 0) {
        let a = Math.atan2(ls, lc) / 2;
        if (a < 0) a += Math.PI;
        lineAngle[ci] = a;
        lineY[ci] = ly / lsum / sy;
      }
      const m0 = sum / ns;
      mean[ci] = m0;
      peak[ci] = mx;
      let mat = 0,
        best = 0;
      for (let m = 1; m < matCount.length; m++) {
        if (matCount[m] > best) {
          best = matCount[m];
          mat = m;
        }
      }
      if (best < ns * 0.25 && m0 < cfg.inkFloor) mat = 0;
      out.material[ci] = mat;
      out.ink[ci] = Math.min(255, Math.round((m0 / 0.62) * 255));
      if (dmax > -Infinity) out.depth[ci] = Math.max(-32767, Math.min(32767, Math.round(dmax)));
      out.flags[ci] = osum / ns >= 0.5 || m0 >= cfg.inkFloor ? FLAG_OPAQUE : 0;
      let dom = 0;
      for (let b = 1; b < 4; b++) if (bins[b] > bins[dom]) dom = b;
      if (edges >= cfg.edgeFrac * ns && bins[dom] >= cfg.edgeAgree * edges && m0 >= cfg.edgeInkMin) {
        cand[ci] = dom;
        strength[ci] = binS[dom];
        yc[ci] = binW[dom] > 0 ? binY[dom] / binW[dom] / sy : 0.5;
      }
    }
  }

  // Ridges from the line map: one glyph thick (non-maximum suppression across
  // the line), direction from the generator's own geometry.
  const ridge = new Int8Array(n).fill(-1);
  for (let ci = 0; ci < n; ci++) {
    if (lineMax[ci] < cfg.lineMin) continue;
    const row = (ci / cols) | 0,
      col = ci - row * cols;
    const b = angleBin(lineAngle[ci]);
    const n1 = b === 0 ? (row > 0 ? ci - cols : -1) : col > 0 ? ci - 1 : -1;
    const n2 = b === 0 ? (row < rows - 1 ? ci + cols : -1) : col < cols - 1 ? ci + 1 : -1;
    const st = lineSum[ci];
    if ((n1 >= 0 && lineMax[n1] >= cfg.lineMin && lineSum[n1] > st) || (n2 >= 0 && lineMax[n2] >= cfg.lineMin && lineSum[n2] >= st)) continue;
    ridge[ci] = b;
  }

  // Pass 2: thin contours (non-maximum suppression across the line).
  const keep = new Int8Array(n).fill(-1);
  const thinned = new Uint8Array(n);
  for (let ci = 0; ci < n; ci++) {
    const b = cand[ci];
    if (b < 0) continue;
    const row = (ci / cols) | 0,
      col = ci - row * cols;
    // Neighbours across the line: above/below for horizontal edges, left/right otherwise.
    const n1 = b === 0 ? (row > 0 ? ci - cols : -1) : col > 0 ? ci - 1 : -1;
    const n2 = b === 0 ? (row < rows - 1 ? ci + cols : -1) : col < cols - 1 ? ci + 1 : -1;
    const st = strength[ci];
    if ((n1 >= 0 && cand[n1] === b && strength[n1] > st) || (n2 >= 0 && cand[n2] === b && strength[n2] >= st)) thinned[ci] = 1;
    else keep[ci] = b;
  }
  // Pass 3: continuity. A contour glyph stands only if the line carries on
  // into a neighbour; short isolated hatch marks fall back to tone, so the
  // long strokes (ridges, banks, trunks) are the ones that read as line.
  const along: Record<number, [number, number][]> = {
    0: [[0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]],
    1: [[-1, 0], [-1, 1], [1, 0], [1, -1], [0, 1], [0, -1]],
    2: [[-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]],
    3: [[-1, 0], [-1, -1], [1, 0], [1, 1], [0, 1], [0, -1]],
  };
  const contour = new Int8Array(n).fill(-1);
  for (let ci = 0; ci < n; ci++) {
    const b = keep[ci];
    if (b < 0) continue;
    const row = (ci / cols) | 0,
      col = ci - row * cols;
    let links = 0;
    for (const [dr, dc] of along[b]) {
      const rr = row + dr,
        cc = col + dc;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) {
        links++; // chunk or world edge: give it the benefit of the doubt
        continue;
      }
      const nb = keep[rr * cols + cc];
      if (nb >= 0 && (nb === b || (nb + 1) % 4 === b || (b + 1) % 4 === nb)) links++;
    }
    if (links >= cfg.edgeLinks) contour[ci] = b;
  }

  // Pass 4: glyphs. Ink is lighter with distance (smaller depth), and the
  // tone ramp diffuses its quantisation error across cells.
  const err = new Float32Array((cols + 2) * 2);
  for (let row = 0; row < rows; row++) {
    const cur = (row & 1) * (cols + 2);
    const nxt = ((row + 1) & 1) * (cols + 2);
    err.fill(0, nxt, nxt + cols + 2);
    for (let col = 0; col < cols; col++) {
      const ci = row * cols + col;
      const m0 = mean[ci];
      if (m0 < cfg.inkFloor && ridge[ci] < 0) continue;
      const mat = out.material[ci];
      const vRaw = Math.pow(Math.min(1, m0 / cfg.inkMax), cfg.inkGamma);
      const d = out.depth[ci];
      const near = d === -32768 ? 1 : Math.min(1, Math.max(0, (d - cfg.depthFar) / (cfg.depthNear - cfg.depthFar)));
      const fade = cfg.depthFade + (1 - cfg.depthFade) * near;
      const tone = (v: number) => toneOf(v * fade);

      const rb = ridge[ci];
      if (rb >= 0 && mat !== MAT.water && mat !== MAT.foliage) {
        out.glyph[ci] = contourGlyph(rb, lineY[ci]);
        const lineV = Math.min(1, lineMax[ci]) * cfg.ridgeTone + Math.min(1, m0 / cfg.inkMax) * (1 - cfg.ridgeTone);
        out.tone[ci] = tone(Math.max(cfg.lineTone, lineV));
        out.flags[ci] |= FLAG_CONTOUR | FLAG_OPAQUE;
        continue;
      }
      if (m0 < cfg.inkFloor) continue;
      if (mat === MAT.water) {
        const v = Math.min(1, vRaw * 1.3);
        out.glyph[ci] = WATER[Math.min(WATER.length - 1, Math.floor(v * WATER.length))];
        out.tone[ci] = tone(0.25 + v * 0.6);
        continue;
      }
      if (mat === MAT.mist) {
        out.glyph[ci] = MIST[Math.min(MIST.length - 1, Math.floor(vRaw * 2 * MIST.length))];
        out.tone[ci] = tone(Math.min(0.45, 0.15 + vRaw * 0.5));
        continue;
      }
      if (mat === MAT.foliage) {
        // Few glyph classes and most of the density in tone, so a crown reads
        // as one dark clump rather than speckle; ^ marks the top of a crown.
        const v = Math.min(1, vRaw);
        const above = row > 0 ? out.material[ci - cols] : 0;
        let k = Math.min(FOLIAGE.length - 1, Math.floor(Math.pow(v, 1.4) * FOLIAGE.length));
        if (above !== MAT.foliage && k > 0 && k < 4) k = 1;
        out.glyph[ci] = FOLIAGE[k];
        out.tone[ci] = tone(0.3 + v * 0.7);
        continue;
      }

      const b = contour[ci];
      const suppressed = thinned[ci] === 1;
      if (b >= 0) {
        out.glyph[ci] = contourGlyph(b, yc[ci]);
        const lineV = Math.pow(Math.min(1, (peak[ci] * 0.6 + m0 * 0.6) / cfg.inkMax), cfg.inkGamma);
        out.tone[ci] = tone(cfg.lineTone + lineV * (1 - cfg.lineTone));
        out.flags[ci] |= FLAG_CONTOUR;
        continue;
      }

      // The thinner neighbour of a contour keeps only a trace of its ink.
      const vt = suppressed ? vRaw * 0.35 : vRaw;
      const v = Math.min(1, Math.max(0, vt + err[cur + col + 1] * cfg.dither));
      // Trunks and buildings are outlined by their lines; their interiors stay light.
      const L = mat === MAT.trunk || mat === MAT.architecture ? 7 : RAMP.length;
      const q = Math.min(L - 1, Math.max(0, Math.round(v * L - 0.5)));
      const e = v - (q + 0.5) / L;
      err[cur + col + 2] += (e * 7) / 16;
      err[nxt + col] += (e * 3) / 16;
      err[nxt + col + 1] += (e * 5) / 16;
      err[nxt + col + 2] += (e * 1) / 16;
      if (suppressed && vt < 0.5 / L) continue;
      out.glyph[ci] = RAMP[q];
      out.tone[ci] = tone(0.12 + vt * 0.88);
    }
  }
  return out;
}
