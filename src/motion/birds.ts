// Birds: a small flock of v's crossing the sky every 20-40 s in a loose
// formation, each bird flapping between v and - on its own phase.

import { config, glyphIndex } from '../config';

export interface Bird {
  col: number;
  row: number;
  glyph: number;
}

interface Flock {
  t0: number;
  dir: 1 | -1;
  row: number;
  speed: number;
  birds: { dx: number; dy: number; phase: number; wob: number }[];
}

const V = glyphIndex('v');
const DASH = glyphIndex('-');

export class Birds {
  private flock: Flock | null = null;
  private next: number;
  constructor(now: number) {
    // The first flock comes a little sooner than the steady rate.
    this.next = now + 8 + Math.random() * 10;
  }

  update(t: number, screenCols: number, rows: number): Bird[] {
    if (!this.flock && t >= this.next) {
      const n = 3 + Math.floor(Math.random() * 5);
      const birds = [];
      for (let i = 0; i < n; i++) {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        birds.push({ dx: -Math.abs(k) * (2 + Math.random() * 1.5), dy: k * 0.9 + (Math.random() - 0.5) * 0.8, phase: Math.random(), wob: Math.random() * 6 });
      }
      this.flock = {
        t0: t,
        dir: Math.random() < 0.5 ? 1 : -1,
        row: Math.round(rows * (0.08 + Math.random() * 0.17)),
        speed: screenCols / (22 + Math.random() * 10),
        birds,
      };
    }
    const f = this.flock;
    if (!f) return [];
    const age = t - f.t0;
    const lead = -12 + age * f.speed;
    const out: Bird[] = [];
    for (const b of f.birds) {
      const x = lead + b.dx;
      const col = Math.round(f.dir === 1 ? x : screenCols - 1 - x);
      const row = Math.round(f.row + b.dy + Math.sin(age * 0.5 + b.wob) * 0.6);
      const flap = ((age / config.birdFlapPeriod + b.phase) % 1) < 0.5;
      out.push({ col, row, glyph: flap ? V : DASH });
    }
    if (lead - 12 > screenCols) {
      this.flock = null;
      this.next = t + config.birdIntervalMin + Math.random() * (config.birdIntervalMax - config.birdIntervalMin);
    }
    return out;
  }

  reset(t: number): void {
    this.flock = null;
    this.next = t + 8 + Math.random() * 10;
  }
}
