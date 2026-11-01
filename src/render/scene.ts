// The scene: every frame, composite sky, sun/moon/stars, clouds, the far
// silhouettes, the background and foreground chunks (palette indices looked
// up through the graded, colour-cycled palette), then the living things —
// boats, birds, smoke, lanterns, fireflies, rain, mist, ripples — into one
// small native-resolution image that CSS scales up with crisp pixels.

import { config } from '../config';
import { bayer, ENTRIES, FAR_SIL, PALETTE_SIZE, type RGB, WATER, WATER_LINE } from '../pixel/palette';
import { BIRD, BOATS, CRANE, flipped, type Sprite } from '../pixel/sprites';
import { grade, type Light, lightAt } from '../pixel/timeofday';
import { noise } from '../world/noise';
import type { ChunkGrid, Layer } from './build';

/** Anything that can hand out built chunks (the worker-backed cache, or a synchronous one for stills). */
export interface ChunkSource {
  get(seed: number, layer: Layer, index: number): { grid: ChunkGrid } | undefined;
}

const IS_WATER = new Uint8Array(256);
for (const e of ENTRIES.keys()) {
  const ent = ENTRIES[e];
  if (ent.cycle === 'sparkle') IS_WATER[e] = 1;
}
for (const i of [...WATER, WATER_LINE]) IS_WATER[i] = 1;

const SPARKLE_STEPS: RGB[] = [
  [87, 151, 176],
  [125, 181, 198],
  [214, 240, 244],
  [125, 181, 198],
];
const FALL_STEPS: RGB[] = [
  [226, 242, 244],
  [190, 222, 230],
  [160, 204, 216],
  [206, 232, 236],
];

export interface Effects {
  water: boolean;
  clouds: boolean;
  mist: boolean;
  boats: boolean;
  birds: boolean;
  smoke: boolean;
  night: boolean;
  weather: boolean;
  ripples: boolean;
  reveal: boolean;
}

interface Particle {
  x: number; // world px (foreground space) or screen px for screen-space things
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  kind: 'smoke' | 'lantern' | 'firefly' | 'star' | 'ripple';
  seed: number;
}

interface Flock {
  t0: number;
  dir: 1 | -1;
  y: number;
  speed: number;
  crane: boolean;
  birds: { dx: number; dy: number; phase: number }[];
}

interface Cloud {
  x: number; // in cloud space (scrolls at 0.1 parallax)
  y: number;
  w: number;
  h: number;
  px: Uint8Array; // 1 light, 2 shade
  speed: number;
}

export interface SceneStats {
  frameMs: number;
  missingCols: number;
  particles: number;
}

const pack = (r: number, g: number, b: number) => (255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r);

export class Scene {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img!: ImageData;
  private buf!: Uint32Array;
  W = 0;
  H = 0;
  scale = 3;
  cssW = 0;
  cssH = 0;
  /** World pixel row shown in screen row 0 (negative: sky extends above the world). */
  rowOffset = 0;
  private pal = new Uint32Array(256);
  private palRGB: RGB[] = Array.from({ length: 256 }, () => [0, 0, 0] as RGB);
  light: Light = lightAt(config.startTime);
  displaySeed = 0;
  revealStart: number | null = null;
  revealSpan = config.revealMs / 1000;
  outStart: number | null = null;
  rain = 0;
  private rainTarget = 0;
  private nextWeather = 0;
  private particles: Particle[] = [];
  private flock: Flock | null = null;
  private nextFlock = 0;
  private clouds: Cloud[] = [];
  private lastT = 0;
  private lastSmoke = 0;
  stats: SceneStats = { frameMs: 0, missingCols: 0, particles: 0 };

  constructor(
    root: HTMLElement,
    private cache: ChunkSource,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scene';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
  }

  resize(cssW: number, cssH: number): void {
    let s = Math.round(cssH / config.targetRows);
    s = Math.max(config.minScale, Math.min(config.maxScale, s));
    while (s > 1 && cssW / s < 150) s--;
    this.scale = s;
    this.cssW = cssW;
    this.cssH = cssH;
    this.W = Math.ceil(cssW / s);
    this.H = Math.ceil(cssH / s);
    const extra = config.worldPx - this.H;
    // A short screen crops mostly sky, keeping the land and the lake.
    this.rowOffset = extra > 0 ? Math.round(extra * 0.62) : extra;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = `${this.W * s}px`;
    this.canvas.style.height = `${this.H * s}px`;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    if (!this.clouds.length) this.seedClouds();
  }

  /** CSS px per world unit along x. */
  pxPerUnit(): number {
    return this.scale / config.unitsPerPx;
  }

  /** First native pixel column of a layer at a scroll position. */
  offset(layer: Layer | 'far', scrollX: number): number {
    const k = layer === 'foreground' ? 1 : layer === 'background' ? config.parallax : config.farParallax;
    return Math.floor((scrollX * k) / config.unitsPerPx);
  }

  viewReady(seed: number, scrollX: number): boolean {
    for (const layer of ['background', 'foreground'] as Layer[]) {
      const o = this.offset(layer, scrollX);
      for (let c = Math.floor(o / config.chunkPx); c <= Math.floor((o + this.W) / config.chunkPx); c++) if (!this.cache.get(seed, layer, c)) return false;
    }
    return true;
  }

  // --- palette --------------------------------------------------------------------

  private gradePalette(t: number, fx: Effects): void {
    const L = this.light;
    const tmp: RGB = [0, 0, 0];
    const step = fx.water ? Math.floor(t * 5) : 0;
    const fall = fx.water ? Math.floor(t * 11) : 0;
    for (let i = 1; i < PALETTE_SIZE; i++) {
      const e = ENTRIES[i];
      let c: RGB = e.rgb;
      if (e.cycle === 'sparkle') c = SPARKLE_STEPS[(e.phase! + step) & 3];
      else if (e.cycle === 'fall') c = FALL_STEPS[(e.phase! - fall) & 3];
      grade(c, L, tmp);
      if (e.glow && L.night > 0) {
        const n = L.night;
        tmp[0] += (e.glow[0] - tmp[0]) * n;
        tmp[1] += (e.glow[1] - tmp[1]) * n;
        tmp[2] += (e.glow[2] - tmp[2]) * n;
      }
      this.palRGB[i] = [tmp[0], tmp[1], tmp[2]];
      this.pal[i] = pack(tmp[0], tmp[1], tmp[2]);
    }
  }

  // --- frame ----------------------------------------------------------------------------

  frame(now: number, timeOfDay: number, scrollX: number, fx: Effects): void {
    const t0 = performance.now();
    const t = now;
    const dt = Math.min(0.1, t - (this.lastT || t));
    this.lastT = t;
    this.updateWeather(t, fx);
    this.light = lightAt(timeOfDay, this.rain);
    this.gradePalette(t, fx);
    const L = this.light;
    const { W, H, buf } = this;
    const horizonRow = config.horizonY / config.unitsPerPx - this.rowOffset;

    // 1. Sky: a banded gradient with dithered steps, the pixel-art way.
    const NB = 12;
    const bands: number[] = [];
    for (let b = 0; b <= NB; b++) {
      const p = b / NB;
      const c = p < 0.55 ? lerp3(L.sky[0], L.sky[1], p / 0.55) : lerp3(L.sky[1], L.sky[2], (p - 0.55) / 0.45);
      bands.push(pack(c[0], c[1], c[2]));
    }
    // The gradient spans whatever sky is on screen (tall phones show more of it).
    const skyTop = Math.min(horizonRow - 150, 0);
    for (let y = 0; y < H; y++) {
      const p = Math.max(0, Math.min(1, (y - skyTop) / (horizonRow - skyTop))) * NB;
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const f = Math.floor(p);
        buf[row + x] = bands[Math.min(NB, p - f > bayer(x, y) ? f + 1 : f)];
      }
    }

    // 2. Stars, sun, moon.
    if (L.night > 0.05) this.drawStars(t, L.night, horizonRow);
    if (L.sun.h > -0.15) this.drawDisc(L.sun.x, L.sun.h, horizonRow, 6, [255, 236, 190], [255, 210, 140], 1);
    if (L.moon.h > -0.1 && L.night > 0.2) this.drawDisc(L.moon.x, L.moon.h, horizonRow, 4, [236, 236, 220], [180, 190, 220], L.night);

    // 3. Clouds.
    if (fx.clouds || this.clouds.length) this.drawClouds(t, dt, scrollX, horizonRow, fx.clouds);

    // 4. Far silhouettes.
    {
      const off = this.offset('far', scrollX);
      const c0 = this.pal[FAR_SIL[0]],
        c1 = this.pal[FAR_SIL[1]];
      for (let x = 0; x < W; x++) {
        const gx = off + x;
        const hgt = 10 + noise(gx * 0.004, 77) * 46 + noise(gx * 0.02, 78) * 10;
        const top = Math.round(horizonRow - hgt);
        for (let y = Math.max(0, top); y < Math.min(H, horizonRow + 3); y++) buf[y * W + x] = y - top < 2 ? c1 : (y + x) & 1 && y - top < 4 ? c1 : c0;
      }
    }

    // 5-6. Background and foreground chunks.
    const reveal = this.revealProgress(t, fx);
    this.stats.missingCols = 0;
    this.drawLayer('background', scrollX, reveal.bg);
    this.drawLayer('foreground', scrollX, reveal.fg);

    // 7. The sun's (or moon's) glitter path on the lake.
    if (fx.water) this.drawGlitter(t, horizonRow, scrollX);

    // 8. Living things.
    if (reveal.fg >= 1) {
      if (fx.boats) this.drawBoats(t, scrollX);
      this.updateParticles(t, dt, scrollX, fx);
      if (fx.birds) this.drawBirds(t, horizonRow);
    }

    // 9. Mist banks drifting across the middle distance.
    if (fx.mist) this.drawMist(t, scrollX);
    // 10. Rain.
    if (this.rain > 0.02) this.drawRain(t);
    // 11. Night glow around lights.
    if (fx.night && L.night > 0.05 && reveal.fg >= 1) this.drawGlow(scrollX, L.night);

    this.ctx.putImageData(this.img, 0, 0);
    this.stats.frameMs = performance.now() - t0;
    this.stats.particles = this.particles.length;
  }

  private revealProgress(t: number, fx: Effects): { bg: number; fg: number } {
    if (this.revealStart === null) return { bg: 0, fg: 0 };
    if (this.outStart !== null) {
      const p = 1 - (t - this.outStart) / ((config.newPaintingMs / 1000) * 0.5);
      return { bg: Math.max(0, p * 1.4), fg: Math.max(0, p) };
    }
    if (!fx.reveal) return { bg: 1, fg: 1 };
    const e = t - this.revealStart;
    const span = this.revealSpan;
    return { bg: Math.min(1, e / (span * 0.55)), fg: Math.min(1, Math.max(0, (e - span * 0.25) / (span * 0.75))) };
  }

  private drawLayer(layer: Layer, scrollX: number, prog: number): void {
    if (prog <= 0) return;
    const { W, H, buf, pal } = this;
    const off = this.offset(layer, scrollX);
    const cp = config.chunkPx;
    const cols: (ChunkGrid | undefined)[] = new Array(W);
    const local = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      const gx = off + x;
      const c = Math.floor(gx / cp);
      cols[x] = this.cache.get(this.displaySeed, layer, c)?.grid;
      local[x] = gx - c * cp;
      if (!cols[x] && layer === 'foreground') this.stats.missingCols++;
    }
    const wp = config.worldPx;
    for (let y = 0; y < H; y++) {
      const wr = y + this.rowOffset;
      if (wr < 0 || wr >= wp) continue;
      const row = y * W;
      const src = wr * cp;
      // Lower rows (nearer) resolve last.
      const rowBias = (wr / wp) * 0.35;
      for (let x = 0; x < W; x++) {
        const g = cols[x];
        if (!g) continue;
        const v = g.px[src + local[x]];
        if (!v) continue;
        if (prog < 1 && bayer(x, y) * 0.65 + rowBias >= prog) continue;
        buf[row + x] = pal[v];
      }
    }
  }

  private fgCell(scrollX: number, sx: number, sy: number): { v: number; depth: number } | null {
    const gx = this.offset('foreground', scrollX) + sx;
    const c = Math.floor(gx / config.chunkPx);
    const g = this.cache.get(this.displaySeed, 'foreground', c)?.grid;
    const wr = sy + this.rowOffset;
    if (!g || wr < 0 || wr >= config.worldPx) return null;
    const i = wr * config.chunkPx + (gx - c * config.chunkPx);
    return { v: g.px[i], depth: g.depth[i] };
  }

  private blend(o: number, rgb: RGB, a: number): void {
    const p = this.buf[o];
    const r = p & 255,
      g = (p >> 8) & 255,
      b = (p >> 16) & 255;
    this.buf[o] = pack(r + (rgb[0] - r) * a, g + (rgb[1] - g) * a, b + (rgb[2] - b) * a);
  }

  private addLight(o: number, rgb: RGB, a: number): void {
    const p = this.buf[o];
    this.buf[o] = pack(Math.min(255, (p & 255) + rgb[0] * a), Math.min(255, ((p >> 8) & 255) + rgb[1] * a), Math.min(255, ((p >> 16) & 255) + rgb[2] * a));
  }

  private drawStars(t: number, night: number, horizonRow: number): void {
    const { W, buf } = this;
    for (let i = 0; i < 160; i++) {
      const h = Math.imul(i + 1, 2654435761) >>> 0;
      const x = h % W;
      const y = Math.floor(((h >>> 12) % 1000) / 1000 * (horizonRow - 8));
      if (y < 0) continue;
      const tw = 0.55 + 0.45 * Math.sin(t * (1 + (h & 7) * 0.4) + i);
      const a = night * tw * (y < horizonRow * 0.7 ? 1 : 0.5);
      const o = y * W + x;
      this.addLight(o, [210, 215, 240], a * ((h & 3) === 0 ? 1 : 0.6));
      if ((h & 15) === 0 && a > 0.6) {
        // A few bright ones get a cross.
        for (const d of [-1, 1, -W, W]) if (o + d >= 0 && o + d < buf.length) this.addLight(o + d, [150, 160, 200], a * 0.4);
      }
    }
    // Shooting star now and then.
    const k = Math.floor(t / 9);
    const ph = t / 9 - k;
    const h = Math.imul(k + 7, 2246822519) >>> 0;
    if (night > 0.7 && (h & 3) === 0 && ph < 0.12) {
      const sx = (h % W) | 0,
        sy = ((h >>> 8) % Math.max(1, Math.floor(horizonRow * 0.5))) | 0;
      const len = 14;
      const head = ph / 0.12;
      for (let s = 0; s < len; s++) {
        const p = head * 40 - s;
        if (p < 0) continue;
        const x = Math.round(sx + p * 1.6),
          y = Math.round(sy + p * 0.7);
        if (x < 0 || x >= W || y < 0 || y >= horizonRow) continue;
        this.addLight(y * W + x, [255, 250, 230], (1 - s / len) * 0.9);
      }
    }
  }

  private drawDisc(xFrac: number, h: number, horizonRow: number, r: number, core: RGB, halo: RGB, strength: number): void {
    const { W, H } = this;
    const cx = Math.round(W * (0.1 + 0.8 * xFrac));
    const cy = Math.round(horizonRow - Math.max(-0.2, h) * (horizonRow * 0.85) + 4);
    const g = grade(core, { ...this.light, mul: [1, 1, 1], add: [0, 0, 0], sat: 1 });
    for (let y = cy - r * 4; y <= cy + r * 4; y++) {
      if (y < 0 || y >= H || y > horizonRow + 1) continue;
      for (let x = cx - r * 4; x <= cx + r * 4; x++) {
        if (x < 0 || x >= W) continue;
        const d = Math.hypot(x - cx, y - cy);
        const o = y * W + x;
        if (d <= r) this.blend(o, g, strength);
        else if (d <= r * 4) {
          const a = (1 - (d - r) / (r * 3)) ** 2 * 0.35 * strength;
          if (a > bayer(x, y) * 0.35) this.addLight(o, halo, a);
        }
      }
    }
  }

  private seedClouds(): void {
    for (let i = 0; i < 9; i++) this.clouds.push(makeCloud(Math.random() * 1600, 8 + Math.random() * 70));
  }

  private drawClouds(t: number, dt: number, scrollX: number, horizonRow: number, moving: boolean): void {
    const { W, H } = this;
    const off = (scrollX * 0.1) / config.unitsPerPx;
    const L = this.light;
    const light = grade([252, 252, 248], L);
    const shade = grade([206, 216, 232], L);
    const span = 1600;
    for (const c of this.clouds) {
      if (moving) c.x += c.speed * dt;
      const sx = Math.round(((((c.x - off) % span) + span) % span) - 200);
      const sy = Math.round(horizonRow - 140 + c.y);
      if (sx > W) continue;
      for (let y = 0; y < c.h; y++) {
        const yy = sy + y;
        if (yy < 0 || yy >= H || yy > horizonRow - 4) continue;
        for (let x = 0; x < c.w; x++) {
          const v = c.px[y * c.w + x];
          if (!v) continue;
          const xx = sx + x;
          if (xx < 0 || xx >= W) continue;
          this.blend(yy * W + xx, v === 1 ? light : shade, 0.85 * (1 - this.rain * 0.3));
        }
      }
    }
  }

  private drawGlitter(t: number, horizonRow: number, scrollX: number): void {
    const L = this.light;
    const body = L.sun.h > 0 ? L.sun : L.moon.h > 0 && L.night > 0.3 ? L.moon : null;
    if (!body) return;
    const { W, H } = this;
    const cx = W * (0.1 + 0.8 * body.x);
    const warm: RGB = body === L.sun ? grade([255, 230, 170], { ...L, mul: [1, 1, 1], add: [0, 0, 0] }) : [220, 225, 240];
    const k = Math.floor(t * 4);
    for (let y = Math.ceil(horizonRow) + 1; y < H; y++) {
      const spread = 3 + (y - horizonRow) * 0.25;
      for (let x = Math.max(0, Math.floor(cx - spread)); x <= Math.min(W - 1, Math.ceil(cx + spread)); x++) {
        const cell = this.fgCell(scrollX, x, y);
        if (!cell || !IS_WATER[cell.v]) continue;
        const h = (Math.imul(x * 73856093 ^ y * 19349663 ^ k * 83492791, 1) >>> 0) & 255;
        const a = (1 - Math.abs(x - cx) / spread) * (body === L.sun ? 0.9 : 0.6);
        if (h < 70 * a) this.blend(y * W + x, warm, Math.min(1, a + 0.2));
      }
    }
  }

  private drawSprite(sp: Sprite, left: number, top: number, scrollX: number | null, depth: number, alpha = 1): void {
    const { W, H } = this;
    for (let y = 0; y < sp.h; y++) {
      const yy = top + y;
      if (yy < 0 || yy >= H) continue;
      for (let x = 0; x < sp.w; x++) {
        const c = sp.px[y * sp.w + x];
        if (!c) continue;
        const xx = left + x;
        if (xx < 0 || xx >= W) continue;
        if (scrollX !== null) {
          const cell = this.fgCell(scrollX, xx, yy);
          if (cell && cell.depth > depth + 1 && !IS_WATER[cell.v]) continue;
        }
        if (alpha >= 1) this.buf[yy * W + xx] = this.pal[c];
        else this.blend(yy * W + xx, this.palRGB[c], alpha);
      }
    }
  }

  private flipCache = new Map<Sprite, Sprite>();
  private flipOf(s: Sprite): Sprite {
    let f = this.flipCache.get(s);
    if (!f) this.flipCache.set(s, (f = flipped(s)));
    return f;
  }

  private drawBoats(t: number, scrollX: number): void {
    const off = this.offset('foreground', scrollX);
    const cp = config.chunkPx;
    for (let c = Math.floor((off - 60) / cp); c <= Math.floor((off + this.W + 60) / cp); c++) {
      const g = this.cache.get(this.displaySeed, 'foreground', c)?.grid;
      if (!g) continue;
      for (const b of g.boats) {
        const base = BOATS[b.variant % BOATS.length];
        const sp = b.flip ? this.flipOf(base) : base;
        // Drift slowly along the water, nose first, and bob a pixel.
        const sw = Math.sin(t * 0.05 + b.phase * 6.28);
        const dx = Math.round(sw * config.boatDrift);
        const dir = Math.cos(t * 0.05 + b.phase * 6.28) * (b.flip ? -1 : 1);
        const bob = Math.sin(t * 1.3 + b.phase * 20) > 0.55 ? 1 : 0;
        const left = c * cp + b.x + dx - off - (sp.w >> 1);
        const top = b.y - this.rowOffset - sp.h + 1 + bob;
        this.drawSprite(sp, left, top, scrollX, b.depth);
        // A wake trailing behind.
        const wy = top + sp.h;
        const wakeX = dir > 0 ? left - 2 : left + sp.w + 1;
        for (let k = 0; k < 6; k++) {
          const x = wakeX - Math.sign(dir) * k * 2;
          if (x < 0 || x >= this.W || wy < 0 || wy >= this.H) continue;
          const cell = this.fgCell(scrollX, x, wy);
          if (cell && IS_WATER[cell.v] && (k + Math.floor(t * 3)) % 3 !== 0) this.buf[wy * this.W + x] = this.pal[WATER_LINE];
        }
      }
    }
  }

  private drawBirds(t: number, horizonRow: number): void {
    if (!this.flock && t >= this.nextFlock) {
      const crane = Math.random() < 0.35;
      const n = crane ? 3 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 6);
      const birds = [];
      for (let i = 0; i < n; i++) {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        birds.push({ dx: -Math.abs(k) * (crane ? 9 : 6) - Math.random() * 3, dy: k * (crane ? 4 : 3) + (Math.random() - 0.5) * 2, phase: Math.random() });
      }
      this.flock = { t0: t, dir: Math.random() < 0.5 ? 1 : -1, y: horizonRow - 40 - Math.random() * 80, speed: this.W / (crane ? 34 : 22), crane, birds };
    }
    const f = this.flock;
    if (!f) return;
    const age = t - f.t0;
    const lead = -30 + age * f.speed;
    for (const b of f.birds) {
      const x = lead + b.dx;
      const sx = Math.round(f.dir === 1 ? x : this.W - x);
      const sy = Math.round(f.y + b.dy + Math.sin(age * 0.7 + b.phase * 6) * 1.5);
      const frames = f.crane ? CRANE : BIRD;
      const fr = frames[Math.floor(age * (f.crane ? 2.2 : 4) + b.phase * 2) % 2];
      const sp = f.dir === -1 ? this.flipOf(fr) : fr;
      this.drawSprite(sp, sx, sy, null, 0, f.crane ? 1 : 0.85);
    }
    if (lead - 40 > this.W) {
      this.flock = null;
      this.nextFlock = t + config.birdIntervalMin + Math.random() * (config.birdIntervalMax - config.birdIntervalMin);
    }
  }

  /** Smoke from chimneys, sky lanterns and fireflies at night, ripples on the lake. */
  private updateParticles(t: number, dt: number, scrollX: number, fx: Effects): void {
    const L = this.light;
    const off = this.offset('foreground', scrollX);
    const cp = config.chunkPx;
    const wind = 2 + Math.sin(t * 0.05) * 2;
    // Spawn smoke and the occasional lantern from what is in view.
    if (t - this.lastSmoke > 0.35) {
      this.lastSmoke = t;
      for (let c = Math.floor(off / cp); c <= Math.floor((off + this.W) / cp); c++) {
        const g = this.cache.get(this.displaySeed, 'foreground', c)?.grid;
        if (!g) continue;
        if (fx.smoke)
          for (const s of g.smoke) {
            if (Math.random() < 0.5 && this.particles.length < 600) this.particles.push({ x: c * cp + s.x, y: s.y, vx: wind * 0.3, vy: -3 - Math.random() * 2, age: 0, life: 5 + Math.random() * 3, kind: 'smoke', seed: Math.random() });
          }
        if (fx.night && L.night > 0.6 && g.lights.length && Math.random() < 0.03 && this.particles.filter((p) => p.kind === 'lantern').length < 30) {
          const p = g.lights[Math.floor(Math.random() * g.lights.length)];
          this.releaseLantern(c * cp + p.x, p.y);
        }
      }
    }
    if (fx.night && L.night > 0.5 && this.particles.filter((p) => p.kind === 'firefly').length < 40 && Math.random() < 0.3) {
      // Fireflies near foliage, low in the scene.
      for (let tries = 0; tries < 6; tries++) {
        const sx = Math.floor(Math.random() * this.W),
          sy = Math.floor(this.H * (0.45 + Math.random() * 0.5));
        const cell = this.fgCell(scrollX, sx, sy);
        if (cell && cell.v && !IS_WATER[cell.v]) {
          this.particles.push({ x: off + sx, y: sy + this.rowOffset, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 2, age: 0, life: 4 + Math.random() * 5, kind: 'firefly', seed: Math.random() });
          break;
        }
      }
    }
    const { W, H } = this;
    const smokeRGB = grade([206, 206, 200], L);
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age > p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const sx = Math.round(p.x - off);
      const sy = Math.round(p.y - this.rowOffset);
      keep.push(p);
      if (sx < -4 || sx >= W + 4 || sy < -4 || sy >= H + 4) continue;
      const f = p.age / p.life;
      if (p.kind === 'smoke') {
        p.vx += (wind - p.vx) * dt * 0.3;
        const a = (1 - f) * 0.45;
        const r = 1 + Math.floor(f * 2.5);
        for (let y = -r; y <= r; y++)
          for (let x = -r; x <= r; x++) {
            const xx = sx + x,
              yy = sy + y;
            if (xx < 0 || xx >= W || yy < 0 || yy >= H || x * x + y * y > r * r) continue;
            if (bayer(xx, yy) < 0.8) this.blend(yy * W + xx, smokeRGB, a);
          }
      } else if (p.kind === 'lantern') {
        p.vx = Math.sin(p.age * 0.6 + p.seed * 9) * 1.5 + wind * 0.25;
        const glow = Math.min(1, p.age * 2) * (f > 0.85 ? (1 - f) / 0.15 : 1);
        for (let y = -1; y <= 1; y++)
          for (let x = 0; x <= 1; x++) {
            const xx = sx + x,
              yy = sy + y;
            if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
            this.blend(yy * W + xx, y === 1 ? [200, 90, 40] : [255, 190, 100], glow);
          }
        for (let y = -4; y <= 4; y++)
          for (let x = -4; x <= 5; x++) {
            const xx = sx + x,
              yy = sy + y;
            if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
            const d = Math.hypot(x - 0.5, y);
            if (d > 1.6 && d < 4.5) this.addLight(yy * W + xx, [120, 60, 20], (1 - d / 4.5) * 0.5 * glow);
          }
      } else if (p.kind === 'firefly') {
        p.vx += (Math.random() - 0.5) * dt * 6;
        p.vy += (Math.random() - 0.5) * dt * 6;
        const blink = Math.max(0, Math.sin(p.age * 3 + p.seed * 20));
        if (sx >= 0 && sx < W && sy >= 0 && sy < H) this.addLight(sy * W + sx, [210, 255, 120], blink * L.night);
        for (const d of [-1, 1]) if (sx + d >= 0 && sx + d < W && sy >= 0 && sy < H) this.addLight(sy * W + sx + d, [90, 120, 40], blink * L.night * 0.5);
      } else if (p.kind === 'ripple') {
        const rr = 1 + f * 9;
        const a = (1 - f) * 0.8;
        const c = this.palRGB[WATER_LINE];
        for (let k = 0; k < 40; k++) {
          const ang = (k / 40) * Math.PI * 2;
          const xx = Math.round(sx + Math.cos(ang) * rr * 2),
            yy = Math.round(sy + Math.sin(ang) * rr * 0.5);
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          const cell = this.fgCell(scrollX, xx, yy);
          if (cell && IS_WATER[cell.v]) this.blend(yy * W + xx, c, a);
        }
      }
    }
    this.particles = keep;
  }

  releaseLantern(fgX: number, worldRow: number): void {
    this.particles.push({ x: fgX, y: worldRow, vx: 0, vy: -4 - Math.random() * 3, age: 0, life: 22 + Math.random() * 10, kind: 'lantern', seed: Math.random() });
  }

  /** Click or hover handling: is this screen pixel lake? Sky? */
  hitAt(cssX: number, cssY: number, scrollX: number): { kind: 'water' | 'sky' | 'land'; fgX: number; row: number } {
    const sx = Math.floor(cssX / this.scale),
      sy = Math.floor(cssY / this.scale);
    const cell = this.fgCell(scrollX, sx, sy);
    const fgX = this.offset('foreground', scrollX) + sx;
    const row = sy + this.rowOffset;
    if (cell && cell.v && IS_WATER[cell.v]) return { kind: 'water', fgX, row };
    if ((!cell || !cell.v) && row * config.unitsPerPx < config.horizonY) return { kind: 'sky', fgX, row };
    return { kind: 'land', fgX, row };
  }

  ripple(fgX: number, row: number): void {
    if (this.particles.filter((p) => p.kind === 'ripple').length > 12) return;
    this.particles.push({ x: fgX, y: row, vx: 0, vy: 0, age: 0, life: 1.4, kind: 'ripple', seed: 0 });
  }

  private drawMist(t: number, scrollX: number): void {
    const { W, H } = this;
    const L = this.light;
    const mistRGB = grade([232, 238, 236], L);
    const off = this.offset('foreground', scrollX) * 0.85;
    const bands = [150, 190, 232, 268];
    bands.forEach((by, k) => {
      const cy = by - this.rowOffset;
      for (let y = Math.max(0, cy - 9); y < Math.min(H, cy + 9); y++) {
        const fall = 1 - Math.abs(y - cy) / 9;
        for (let x = 0; x < W; x++) {
          const n = noise((x + off) * 0.011 + t * 0.03 * (1 + k * 0.3), y * 0.07 + k * 13, 40);
          const a = Math.max(0, n - 0.5) * 1.4 * fall * (0.5 + L.night * 0.2);
          if (a > bayer(x, y) * 0.45) this.blend(y * W + x, mistRGB, Math.min(0.55, a));
        }
      }
    });
  }

  private updateWeather(t: number, fx: Effects): void {
    if (!fx.weather) {
      this.rainTarget = 0;
    } else {
      if (!this.nextWeather) this.nextWeather = t + config.weatherEvery * (0.6 + Math.random() * 0.6);
      if (t > this.nextWeather) {
        this.rainTarget = this.rainTarget > 0 ? 0 : 1;
        this.nextWeather = t + (this.rainTarget ? 25 + Math.random() * 15 : config.weatherEvery * (0.7 + Math.random() * 0.6));
      }
    }
    this.rain += (this.rainTarget - this.rain) * 0.01;
  }

  private drawRain(t: number): void {
    const { W, H } = this;
    const c = grade([200, 214, 226], this.light);
    const n = Math.floor(260 * this.rain);
    for (let i = 0; i < n; i++) {
      const h = Math.imul(i + 1, 2654435761) >>> 0;
      const speed = 160 + (h % 80);
      const x0 = h % (W + 60);
      const y = ((((h >>> 7) % 997) + t * speed) % (H + 20)) - 10;
      const x = Math.round(x0 - y * 0.35);
      for (let k = 0; k < 4; k++) {
        const yy = Math.round(y + k),
          xx = Math.round(x - k * 0.35);
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        this.blend(yy * W + xx, c, 0.45 * this.rain);
      }
    }
  }

  private drawGlow(scrollX: number, night: number): void {
    const off = this.offset('foreground', scrollX);
    const cp = config.chunkPx;
    const { W, H } = this;
    for (let c = Math.floor(off / cp); c <= Math.floor((off + W) / cp); c++) {
      const g = this.cache.get(this.displaySeed, 'foreground', c)?.grid;
      if (!g) continue;
      for (const p of g.lights) {
        const sx = c * cp + p.x - off,
          sy = p.y - this.rowOffset;
        if (sx < -4 || sx >= W + 4 || sy < -4 || sy >= H + 4) continue;
        for (let y = -3; y <= 3; y++)
          for (let x = -3; x <= 3; x++) {
            const xx = sx + x,
              yy = sy + y;
            if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
            const d = Math.hypot(x, y);
            if (d > 3.2 || d < 0.5) continue;
            this.addLight(yy * W + xx, [90, 55, 20], (1 - d / 3.2) * 0.45 * night);
          }
      }
    }
  }

  /** The current picture, scaled up crisply, at device resolution. */
  snapshot(dpr: number): HTMLCanvasElement {
    const k = Math.max(1, Math.round(this.scale * dpr));
    const out = document.createElement('canvas');
    out.width = this.W * k;
    out.height = this.H * k;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, out.width, out.height);
    return out;
  }

  /** A hash of the composited foreground and background indices on screen (for tests). */
  viewHash(scrollX: number): number {
    let h = 2166136261;
    for (const layer of ['background', 'foreground'] as Layer[]) {
      const off = this.offset(layer, scrollX);
      for (let x = 0; x < this.W; x += 3) {
        const gx = off + x;
        const c = Math.floor(gx / config.chunkPx);
        const g = this.cache.get(this.displaySeed, layer, c)?.grid;
        if (!g) continue;
        for (let y = 0; y < config.worldPx; y += 3) h = Math.imul(h ^ g.px[y * config.chunkPx + gx - c * config.chunkPx], 16777619);
      }
    }
    return h >>> 0;
  }
}

function lerp3(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function makeCloud(x: number, y: number): Cloud {
  // A row of round puffs on a flat base, shaded underneath: the classic pixel cloud.
  const w = 34 + Math.floor(Math.random() * 46);
  const h = 14 + Math.floor(Math.random() * 6);
  const px = new Uint8Array(w * h);
  const base = h - 3;
  const puffs: { cx: number; r: number }[] = [];
  for (let cx = 6; cx < w - 6; cx += 5 + Math.random() * 6) puffs.push({ cx, r: 3 + Math.random() * (h * 0.55) * Math.sin(Math.PI * (cx / w)) + 2 });
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      if (yy > base) continue;
      let inside = false;
      for (const p of puffs) if ((xx - p.cx) ** 2 + (yy - (base - p.r * 0.6)) ** 2 < p.r * p.r) inside = true;
      if (!inside && !(yy >= base - 2 && xx > 3 && xx < w - 4)) continue;
      px[yy * w + xx] = yy >= base - 2 ? 2 : 1;
    }
  return { x, y, w, h, px, speed: 1 + Math.random() * 2.5 };
}
