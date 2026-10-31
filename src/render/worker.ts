// Chunk worker: planner -> generators -> rasterize -> map, off the main thread.
// Receives build requests, answers with the cell arrays as transferables.

import type { BuildConfig } from '../config';
import { buildChunk, clearElementCache, type Layer } from './build';

export interface BuildRequest {
  type: 'build';
  id: number;
  seed: number;
  layer: Layer;
  index: number;
  version: number;
  cfg: BuildConfig;
}

let lastCfgKey = '';

self.onmessage = (e: MessageEvent<BuildRequest | { type: 'reset' }>) => {
  const msg = e.data;
  if (msg.type === 'reset') {
    clearElementCache();
    return;
  }
  const key = JSON.stringify(msg.cfg);
  if (key !== lastCfgKey) {
    clearElementCache();
    lastCfgKey = key;
  }
  const grid = buildChunk(msg.seed, msg.layer, msg.index, msg.cfg, msg.version);
  (self as unknown as Worker).postMessage({ type: 'chunk', id: msg.id, grid }, [
    grid.glyph.buffer,
    grid.tone.buffer,
    grid.material.buffer,
    grid.ink.buffer,
    grid.depth.buffer,
    grid.flags.buffer,
  ]);
};
