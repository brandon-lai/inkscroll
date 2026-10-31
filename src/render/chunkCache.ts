// Chunk cache + worker pool. The compositor asks for what it needs each frame
// (visible first, then ahead in the scroll direction); chunks outside the keep
// window are evicted and regenerate identically if asked for again.

import { type BuildConfig } from '../config';
import type { ChunkGrid, Layer } from './build';
import type { BuildRequest } from './worker';

export interface ChunkEntry {
  grid: ChunkGrid;
  /** performance.now() when it arrived, for the reveal of late chunks. */
  arrivedAt: number;
}

interface Want {
  layer: Layer;
  index: number;
  priority: number;
}

export class ChunkCache {
  /** Keyed by seed|layer|index, so the old painting can stay on screen while the next one builds. */
  private store = new Map<string, ChunkEntry>();
  private inflight = new Map<string, number>();
  private queue: Want[] = [];
  private workers: { w: Worker; busy: boolean }[] = [];
  private nextId = 1;
  seed = 0;
  version = 0;
  cfg: BuildConfig;
  paused = false;
  builds = 0;
  buildMsTotal = 0;
  buildMsMax = 0;
  onArrive: ((layer: Layer, index: number) => void) | null = null;

  constructor(workerCount: number, cfg: BuildConfig) {
    this.cfg = cfg;
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      const slot = { w, busy: false };
      w.onmessage = (e: MessageEvent<{ type: 'chunk'; id: number; grid: ChunkGrid }>) => {
        slot.busy = false;
        const g = e.data.grid;
        const key = `${g.seed}|${g.layer}|${g.index}`;
        if (this.inflight.get(key) === e.data.id) this.inflight.delete(key);
        if (g.version === this.version) {
          this.store.set(key, { grid: g, arrivedAt: performance.now() });
          this.builds++;
          this.buildMsTotal += g.buildMs;
          this.buildMsMax = Math.max(this.buildMsMax, g.buildMs);
          this.onArrive?.(g.layer, g.index);
        }
        this.dispatch();
      };
      this.workers.push(slot);
    }
  }

  get(seed: number, layer: Layer, index: number): ChunkEntry | undefined {
    return this.store.get(`${seed}|${layer}|${index}`);
  }

  count(): number {
    return this.store.size;
  }

  bytes(): number {
    let b = 0;
    for (const e of this.store.values()) b += e.grid.glyph.length * 7;
    return b;
  }

  /** Replace the wish list (called every frame) and hand work to idle workers. */
  want(list: Want[]): void {
    this.queue = list.filter((w) => {
      const key = `${this.seed}|${w.layer}|${w.index}`;
      return !this.store.has(key) && !this.inflight.has(key);
    });
    this.queue.sort((a, b) => a.priority - b.priority);
    this.dispatch();
  }

  private dispatch(): void {
    if (this.paused) return;
    for (const slot of this.workers) {
      if (slot.busy) continue;
      const next = this.queue.shift();
      if (!next) return;
      const id = this.nextId++;
      this.inflight.set(`${this.seed}|${next.layer}|${next.index}`, id);
      slot.busy = true;
      const req: BuildRequest = { type: 'build', id, seed: this.seed, layer: next.layer, index: next.index, version: this.version, cfg: this.cfg };
      slot.w.postMessage(req);
    }
  }

  /** Drop chunks of `layer` outside [from, to], and any seed not in `keepSeeds`. */
  evict(layer: Layer, from: number, to: number, keepSeeds: number[]): void {
    for (const [k, e] of this.store) {
      const g = e.grid;
      if (!keepSeeds.includes(g.seed)) this.store.delete(k);
      else if (g.seed === this.seed && g.layer === layer && (g.index < from || g.index > to)) this.store.delete(k);
    }
  }

  /** Start asking for a different painting; what is cached for the old one stays until evicted. */
  setSeed(seed: number): void {
    this.seed = seed;
    this.queue = [];
  }

  /** New build config: drop everything; late answers are ignored by version. */
  reset(cfg: BuildConfig): void {
    this.cfg = cfg;
    this.version++;
    this.store.clear();
    this.inflight.clear();
    this.queue = [];
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.dispatch();
  }
}
