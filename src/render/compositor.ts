// Compositor: every frame, work out what each visible cell should show
// (cached chunk cell + motion overlays) and draw only the cells that changed.
//
// Two canvases, background (far mountains + mist, 0.6x parallax) under
// foreground. Each is a grid one cell wider than the screen; whole-cell
// scrolls shift the canvas onto itself and paint only the new strip, and the
// sub-cell remainder is a CSS transform, so a pure scroll touches almost no
// pixels. Foreground cells that are not opaque are cleared, letting the
// background show through.

import { BLANK, config, GLYPH_CHARS, MIST, unitsPerCol } from '../config';
import { Birds } from '../motion/birds';
import { boatOffset } from '../motion/boats';
import { breathe } from '../motion/breathe';
import { mistTone, skyMist } from '../motion/mist';
import { resolveAt, scrambleGlyph } from '../motion/reveal';
import { Ripples } from '../motion/ripple';
import { sway } from '../motion/sway';
import { shimmer } from '../motion/water';
import { MAT } from '../world/primitives';
import { type Atlas, buildAtlas } from './atlas';
import type { Layer } from './build';
import type { ChunkCache, ChunkEntry } from './chunkCache';
import { FLAG_CONTOUR, FLAG_OPAQUE } from './glyphMapper';

/** Encoded cell: glyph | tone << 8; TRANSPARENT clears a foreground cell. */
const TRANSPARENT = -1;
const UNSET = -2;
const NONE = -3;
const PAPER_CELL = BLANK;

interface LayerState {
  name: Layer;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  first: number | null;
  frac: number;
  disp: Int32Array;
}

export interface Effects {
  water: boolean;
  mist: boolean;
  sway: boolean;
  breathe: boolean;
  boats: boolean;
  birds: boolean;
  ripple: boolean;
  reveal: boolean;
}

export interface FrameStats {
  /** Cells redrawn because their content changed (not because of scrolling). */
  changed: number;
  /** Cells redrawn because a scroll brought them into view. */
  scrolled: number;
  /** Visible foreground columns whose chunk has not arrived. */
  missingCols: number;
  cells: number;
}

const BREATHE_SKIP = new Set([MAT.rock, MAT.architecture, MAT.figure, MAT.water, MAT.foliage, MAT.mist]);

export class Compositor {
  readonly root: HTMLElement;
  private layers: LayerState[];
  overlay: HTMLCanvasElement;
  atlas!: Atlas;
  dpr = 1;
  cw = 7;
  ch = 13;
  cssW = 0;
  cssH = 0;
  cols = 0;
  rows = 0;
  /** World row shown in screen row 0 (negative when the screen is taller than the world). */
  rowOffset = 0;
  top = 0;
  private ovr = new Int32Array(0);
  private rip: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];
  birds = new Birds(0);
  ripples = new Ripples();
  /** Reveal start (seconds, performance clock) for the painting on screen; null until its first view is ready. */
  revealStart: number | null = null;
  /** Scramble-out start for a new painting, or null. */
  outStart: number | null = null;
  displaySeed = 0;
  mouse: { x: number; y: number } | null = null;
  stats: FrameStats = { changed: 0, scrolled: 0, missingCols: 0, cells: 0 };

  constructor(root: HTMLElement, private cache: ChunkCache) {
    this.root = root;
    const make = (name: Layer): LayerState => {
      const canvas = document.createElement('canvas');
      canvas.className = `layer layer-${name}`;
      canvas.setAttribute('aria-hidden', 'true');
      root.appendChild(canvas);
      return { name, canvas, ctx: canvas.getContext('2d', { alpha: name === 'foreground' })!, first: null, frac: 0, disp: new Int32Array(0) };
    };
    this.layers = [make('background'), make('foreground')];
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'layer layer-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    root.appendChild(this.overlay);
  }

  get fgCanvas(): HTMLCanvasElement {
    return this.layers[1].canvas;
  }
  get bgCanvas(): HTMLCanvasElement {
    return this.layers[0].canvas;
  }

  /** Size the grid to the viewport. Returns true if the cell size changed. */
  resize(cssW: number, cssH: number, dprRaw: number, glyphChars = GLYPH_CHARS): boolean {
    const dpr = Math.min(config.dprCap, Math.max(1, dprRaw));
    let scale = cssH / (config.viewRows * config.cell.h);
    scale = Math.max(config.minScale, Math.min(config.maxScale, scale));
    if (cssW < config.mobileBreakpoint) scale = Math.max(scale, cssW / (config.maxMobileCols * config.cell.w));
    const cw = Math.max(4, Math.round(config.cell.w * scale * dpr));
    const ch = Math.max(7, Math.round((cw * config.cell.h) / config.cell.w));
    const changed = cw !== this.cw || ch !== this.ch || dpr !== this.dpr || !this.atlas;
    this.dpr = dpr;
    this.cw = cw;
    this.ch = ch;
    this.cssW = cssW;
    this.cssH = cssH;
    const cellW = cw / dpr,
      cellH = ch / dpr;
    this.cols = Math.ceil(cssW / cellW) + 1;
    this.rows = Math.ceil(cssH / cellH);
    this.rowOffset = config.worldRows - this.rows;
    this.top = cssH - this.rows * cellH;
    if (changed) this.atlas = buildAtlas(cw, ch, glyphChars);
    for (const L of [...this.layers]) {
      L.canvas.width = this.cols * cw;
      L.canvas.height = this.rows * ch;
      L.canvas.style.width = `${(this.cols * cw) / dpr}px`;
      L.canvas.style.height = `${(this.rows * ch) / dpr}px`;
      L.first = null;
      L.disp = new Int32Array(this.cols * this.rows).fill(UNSET);
      if (L.name === 'background') {
        L.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper') || '#F3EEE3';
        L.ctx.fillRect(0, 0, L.canvas.width, L.canvas.height);
      }
    }
    this.overlay.width = this.cols * cw;
    this.overlay.height = this.rows * ch;
    this.overlay.style.width = `${(this.cols * cw) / dpr}px`;
    this.overlay.style.height = `${(this.rows * ch) / dpr}px`;
    this.ovr = new Int32Array(this.cols * this.rows);
    this.rip = [new Float32Array(this.cols * this.rows), new Float32Array(this.cols * this.rows)];
    return changed;
  }

  /** CSS px per world unit along x. */
  pxPerUnit(): number {
    return this.cw / this.dpr / unitsPerCol();
  }

  /** First fully or partly visible column and sub-cell fraction for a layer at a scroll position. */
  colsAt(layer: Layer, scrollX: number): { first: number; frac: number } {
    const k = layer === 'background' ? config.parallax : 1;
    const off = (scrollX * k) / unitsPerCol();
    const first = Math.floor(off);
    return { first, frac: off - first };
  }

  /** Is the given painting's first screenful ready (both layers)? */
  viewReady(seed: number, scrollX: number): boolean {
    for (const L of this.layers) {
      const { first } = this.colsAt(L.name, scrollX);
      const c0 = Math.floor(first / config.chunkCols);
      const c1 = Math.floor((first + this.cols) / config.chunkCols);
      for (let c = c0; c <= c1; c++) if (!this.cache.get(seed, L.name, c)) return false;
    }
    return true;
  }

  frame(t: number, scrollX: number, fx: Effects): void {
    this.stats.changed = 0;
    this.stats.scrolled = 0;
    this.stats.missingCols = 0;
    this.stats.cells = this.cols * this.rows * 2;
    this.buildOverrides(t, scrollX, fx);
    for (const L of this.layers) this.drawLayer(L, t, scrollX, fx);
  }

  private buildOverrides(t: number, scrollX: number, fx: Effects): void {
    const ovr = this.ovr;
    ovr.fill(NONE);
    const fg = this.colsAt('foreground', scrollX);
    const seed = this.displaySeed;
    const cols = this.cols,
      rows = this.rows;
    const settled = this.revealStart !== null && this.outStart === null;

    // Boats: owned by the chunk their anchor is in; drawn where nothing nearer covers them.
    if (settled) {
      const c0 = Math.floor((fg.first - 20) / config.chunkCols);
      const c1 = Math.floor((fg.first + cols + 20) / config.chunkCols);
      for (let c = c0; c <= c1; c++) {
        const e = this.cache.get(seed, 'foreground', c);
        if (!e) continue;
        for (const b of e.grid.boats) {
          const { dx, dy } = fx.boats ? boatOffset(b.phase, t) : { dx: 0, dy: 0 };
          const bottom = b.row + dy - this.rowOffset;
          const left = b.col + dx - fg.first;
          for (let r = 0; r < b.lines.length; r++) {
            const sr = bottom - (b.lines.length - 1 - r);
            if (sr < 0 || sr >= rows) continue;
            const line = b.lines[r];
            for (let k = 0; k < line.length; k++) {
              const ch = line[k];
              if (ch === ' ') continue;
              const sc = left + k;
              if (sc < 0 || sc >= cols) continue;
              const wr = sr + this.rowOffset;
              const cell = this.cellAt(seed, 'foreground', fg.first + sc, wr);
              if (cell && cell.depth > b.depth + 1) continue;
              ovr[sr * cols + sc] = ch === '@' ? PAPER_CELL : glyphOf(ch) | (b.tone << 8);
            }
          }
        }
      }
    }

    // Birds: screen-space, over empty sky only.
    if (fx.birds && settled) {
      for (const b of this.birds.update(t, cols, rows)) {
        const sr = b.row - Math.min(0, this.rowOffset);
        if (b.col < 0 || b.col >= cols || sr < 0 || sr >= rows) continue;
        const cell = this.cellAt(seed, 'foreground', fg.first + b.col, sr + this.rowOffset);
        if (cell && cell.glyph !== BLANK) continue;
        ovr[sr * cols + b.col] = b.glyph | (4 << 8);
      }
    }

    // Ripples: per layer, how long each cell stays scrambled.
    for (let li = 0; li < 2; li++) {
      const f = this.rip[li];
      f.fill(0);
      if (!fx.ripple || !settled) continue;
      this.ripples.prune(t);
      const { frac } = this.colsAt(li === 0 ? 'background' : 'foreground', scrollX);
      const R = config.rippleRadius;
      const life = config.rippleMs / 1000;
      const aspect = this.ch / this.cw;
      for (const rp of this.ripples.list) {
        // Ripple centre is in screen cells of the foreground grid; convert per layer.
        const cx = rp.col + (li === 0 ? frac - fg.frac : 0);
        for (let r = Math.max(0, Math.floor(rp.row - R / aspect - 1)); r <= Math.min(rows - 1, Math.ceil(rp.row + R / aspect + 1)); r++) {
          for (let c = Math.max(0, Math.floor(cx - R - 1)); c <= Math.min(cols - 1, Math.ceil(cx + R + 1)); c++) {
            const d = Math.hypot(c + 0.5 - cx, (r + 0.5 - rp.row) * aspect);
            if (d > R) continue;
            const until = rp.t0 + life * (0.25 + 0.75 * (d / R));
            const i = r * cols + c;
            if (until > f[i]) f[i] = until;
          }
        }
      }
    }
  }

  private cellAt(seed: number, layer: Layer, wc: number, wr: number): { glyph: number; depth: number } | null {
    if (wr < 0 || wr >= config.worldRows) return null;
    const chunk = Math.floor(wc / config.chunkCols);
    const e = this.cache.get(seed, layer, chunk);
    if (!e) return null;
    const i = wr * e.grid.cols + (wc - chunk * config.chunkCols);
    return { glyph: e.grid.glyph[i], depth: e.grid.depth[i] };
  }

  private drawLayer(L: LayerState, t: number, scrollX: number, fx: Effects): void {
    const { first, frac } = this.colsAt(L.name, scrollX);
    const cols = this.cols,
      rows = this.rows;
    const cw = this.cw,
      ch = this.ch;
    const ctx = L.ctx;
    const disp = L.disp;
    const isFg = L.name === 'foreground';

    if (L.first !== null && first !== L.first) {
      const k = first - L.first;
      if (Math.abs(k) < cols) {
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(L.canvas, -k * cw, 0);
        ctx.globalCompositeOperation = 'source-over';
        for (let r = 0; r < rows; r++) {
          const o = r * cols;
          if (k > 0) {
            disp.copyWithin(o, o + k, o + cols);
            disp.fill(UNSET, o + cols - k, o + cols);
          } else {
            disp.copyWithin(o - k, o, o + cols + k);
            disp.fill(UNSET, o, o - k);
          }
        }
      } else {
        disp.fill(UNSET);
      }
    }
    L.first = first;
    L.frac = frac;
    const tx = -Math.round(frac * cw) / this.dpr;
    L.canvas.style.transform = `translate3d(${tx}px, ${this.top}px, 0)`;
    if (isFg) this.overlay.style.transform = L.canvas.style.transform;

    const seed = this.displaySeed;
    const atlas = this.atlas;
    const slot = atlas.slot;
    const img = atlas.canvas;
    const chunkCols = config.chunkCols;
    const worldRows = config.worldRows;
    const ovr = this.ovr;
    const rip = this.rip[isFg ? 1 : 0];
    const revealSpan = config.revealMs / 1000;
    const outSpan = (config.newPaintingMs / 1000) * 0.5;
    const revealStart = this.revealStart;
    const outStart = this.outStart;

    let entry: ChunkEntry | undefined;
    let entryChunk = NaN;
    for (let c = 0; c < cols; c++) {
      const wc = first + c;
      const chunk = Math.floor(wc / chunkCols);
      if (chunk !== entryChunk) {
        entry = this.cache.get(seed, L.name, chunk);
        entryChunk = chunk;
      }
      if (!entry && isFg && c > 0 && c < cols - 1) this.stats.missingCols++;
      const local = wc - chunk * chunkCols;
      const grid = entry?.grid;
      // Late chunks reveal from their own arrival; ones present at the start share it.
      let rStart = 0,
        rSpan = 0;
      if (entry && revealStart !== null) {
        const arrived = entry.arrivedAt / 1000;
        rStart = Math.max(arrived, revealStart);
        rSpan = arrived > revealStart + 0.05 ? 0.6 : revealSpan;
      }
      for (let r = 0; r < rows; r++) {
        const si = r * cols + c;
        const wr = r + this.rowOffset;
        let want: number;
        if (isFg && ovr[si] !== NONE) {
          want = ovr[si];
        } else if (!grid || wr < 0 || wr >= worldRows || revealStart === null) {
          want = isFg ? TRANSPARENT : PAPER_CELL;
        } else {
          const ci = wr * grid.cols + local;
          const flags = grid.flags[ci];
          let g = grid.glyph[ci];
          let tone = grid.tone[ci];
          if (isFg && !(flags & FLAG_OPAQUE)) {
            want = TRANSPARENT;
          } else {
            const mat = grid.material[ci];
            if (g !== BLANK) {
              if (mat === MAT.water) {
                if (fx.water) g = shimmer(g, wc, wr, t);
              } else if (mat === MAT.foliage) {
                if (fx.sway) g = sway(g, wc, wr, t);
              } else if (mat === MAT.mist) {
                if (fx.mist) tone = Math.max(0, Math.min(7, tone + mistTone(wc, wr, t, cols)));
              } else if (fx.breathe && !(flags & FLAG_CONTOUR) && !BREATHE_SKIP.has(mat)) {
                g = breathe(g, wc, wr, t);
              }
            } else if (!isFg && fx.mist && wr > 8 && wr < 30) {
              const m = skyMist(wc, wr, t, cols);
              if (m >= 0) {
                g = m;
                tone = m === MIST[1] ? 1 : 0;
              }
            }
            // Reveal: scramble, then settle, far layers and upper rows first.
            if (t < rStart + rSpan) {
              const at = rStart + (fx.reveal ? resolveAt(!isFg, wc, wr, worldRows, rSpan) : 0);
              if (t < at && g !== BLANK) {
                const p = Math.max(0, Math.min(1, 1 - (at - t) / (rSpan * 0.45)));
                tone = Math.round(tone * p);
                g = fx.reveal ? scrambleGlyph(wc, wr, t, tone) : BLANK;
              }
            }
            // Hover ripple
            if (rip[si] > t && g !== BLANK) g = scrambleGlyph(wc, wr, t * 1.6, tone);
            want = g | (tone << 8);
          }
        }
        // New painting: the old scene scrambles out.
        if (outStart !== null && want >= 0 && (want & 255) !== BLANK) {
          const at = outStart + outSpan * (0.15 + 0.6 * (1 - wr / worldRows) + 0.25 * ((wc * 0.618) % 1));
          if (t >= at) want = isFg ? (want === TRANSPARENT ? TRANSPARENT : PAPER_CELL) : PAPER_CELL;
          else if (t >= outStart) want = scrambleGlyph(wc, wr, t, want >> 8) | ((want >> 8) << 8);
        }

        const was = disp[si];
        if (want === was) continue;
        if (was === UNSET) this.stats.scrolled++;
        else this.stats.changed++;
        disp[si] = want;
        const x = c * cw,
          y = r * ch;
        if (want === TRANSPARENT) {
          ctx.clearRect(x, y, cw, ch);
        } else {
          const gi = want & 255;
          const s = slot[gi] >= 0 ? slot[gi] : slot[BLANK];
          ctx.drawImage(img, s * cw, (want >> 8) * ch, cw, ch, x, y, cw, ch);
        }
      }
    }
  }

  /** The screen as text: foreground where opaque, else the background cell under it. */
  snapshotText(): string[] {
    const [bg, fg] = this.layers;
    const lines: string[] = [];
    const visCols = Math.ceil(this.cssW / (this.cw / this.dpr));
    for (let r = 0; r < this.rows; r++) {
      let line = '';
      for (let c = 0; c < visCols; c++) {
        const f = fg.disp[r * this.cols + c];
        let v = f;
        if (f < 0) {
          // Background column under this foreground cell's centre.
          const px = c + 0.5 + fg.frac - bg.frac;
          const bc = Math.max(0, Math.min(this.cols - 1, Math.floor(px)));
          v = bg.disp[r * this.cols + bc];
        }
        line += v < 0 ? ' ' : GLYPH_CHARS[v & 255];
      }
      lines.push(line.replace(/\s+$/, ''));
    }
    return lines;
  }

  /** Draw both layers, as positioned on screen, into one canvas at device resolution. */
  snapshotCanvas(paper: string): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = Math.round(this.cssW * this.dpr);
    out.height = Math.round(this.cssH * this.dpr);
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, out.width, out.height);
    for (const L of this.layers) {
      ctx.drawImage(L.canvas, -Math.round(L.frac * this.cw), Math.round(this.top * this.dpr));
    }
    return out;
  }

  /** Mark everything for redraw (theme change, debug overlay switch). */
  invalidate(): void {
    for (const L of this.layers) {
      L.disp.fill(UNSET);
      if (L.name === 'background') {
        L.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper') || '#F3EEE3';
        L.ctx.fillRect(0, 0, L.canvas.width, L.canvas.height);
      }
    }
  }

  /** Screen cell (foreground grid) under a CSS pixel position. */
  cellAtPx(x: number, y: number): { col: number; row: number } {
    const fg = this.layers[1];
    const cellW = this.cw / this.dpr,
      cellH = this.ch / this.dpr;
    return { col: Math.floor(x / cellW + fg.frac), row: Math.floor((y - this.top) / cellH) };
  }

  /** Debug overlay: chunk borders, material colours or raw ink map over the foreground grid. */
  drawDebug(scrollX: number, mode: { borders: boolean; materials: boolean; ink: boolean }): void {
    const ctx = this.overlay.getContext('2d')!;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!mode.borders && !mode.materials && !mode.ink) return;
    const { first } = this.colsAt('foreground', scrollX);
    const cw = this.cw,
      ch = this.ch;
    for (let c = 0; c < this.cols; c++) {
      const wc = first + c;
      const chunk = Math.floor(wc / config.chunkCols);
      const local = wc - chunk * config.chunkCols;
      if (mode.borders && local === 0) {
        ctx.fillStyle = 'rgba(184,53,42,0.7)';
        ctx.fillRect(c * cw, 0, Math.max(1, this.dpr), this.overlay.height);
        ctx.font = `${10 * this.dpr}px monospace`;
        ctx.fillText(`chunk ${chunk}`, c * cw + 3 * this.dpr, 12 * this.dpr);
      }
      if (!mode.materials && !mode.ink) continue;
      const e = this.cache.get(this.displaySeed, 'foreground', chunk);
      if (!e) continue;
      for (let r = 0; r < this.rows; r++) {
        const wr = r + this.rowOffset;
        if (wr < 0 || wr >= config.worldRows) continue;
        const i = wr * e.grid.cols + local;
        if (mode.materials) {
          const m = e.grid.material[i];
          if (m === 0) continue;
          ctx.fillStyle = MATERIAL_COLOURS[m] ?? 'transparent';
          ctx.fillRect(c * cw, r * ch, cw, ch);
        } else {
          const v = e.grid.ink[i];
          if (v === 0) continue;
          ctx.fillStyle = `rgba(20,20,20,${Math.min(1, v / 200)})`;
          ctx.fillRect(c * cw, r * ch, cw, ch);
        }
      }
    }
  }
}

const MATERIAL_COLOURS = [
  'transparent',
  'rgba(120,170,255,0.35)', // mist
  'rgba(150,120,220,0.35)', // farMountain
  'rgba(120,120,120,0.35)', // mountain
  'rgba(160,110,60,0.45)', // rock
  'rgba(40,120,230,0.45)', // water
  'rgba(40,170,70,0.45)', // foliage
  'rgba(120,80,40,0.45)', // trunk
  'rgba(230,140,30,0.5)', // architecture
  'rgba(230,40,40,0.6)', // figure
  'rgba(230,40,200,0.55)', // boat
];

const glyphCache = new Map<string, number>();
function glyphOf(ch: string): number {
  let g = glyphCache.get(ch);
  if (g === undefined) {
    const i = GLYPH_CHARS.indexOf(ch);
    g = i >= 0 ? i : BLANK;
    glyphCache.set(ch, g);
  }
  return g;
}


