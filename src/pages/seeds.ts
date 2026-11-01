// Five seeds side by side as stills, at a few times of day, for review.
import '../style.css';
import './pages.css';
import { buildConfig, config } from '../config';
import { buildChunk, type ChunkGrid, type Layer } from '../render/build';
import { Scene } from '../render/scene';
import { noiseSeed } from '../world/noise';

const params = new URLSearchParams(location.search);
const seeds = (params.get('seeds') ?? '123456,777,424242,31415,900001').split(',').map(Number).filter(Number.isFinite);
const times = (params.get('times') ?? '0.62,0.755,0.95').split(',').map(Number);
const x = Number(params.get('x') ?? 2000);
const root = document.getElementById('sheet')!;
const cfg = buildConfig(config);
const fx = { water: true, clouds: true, mist: true, boats: true, birds: false, smoke: false, night: true, weather: false, ripples: false, reveal: false };

for (const seed of seeds) {
  const store = new Map<string, ChunkGrid>();
  const source = {
    get(s: number, layer: Layer, index: number) {
      const key = `${layer}${index}`;
      let g = store.get(key);
      if (!g) store.set(key, (g = buildChunk(s, layer, index, cfg)));
      return { grid: g };
    },
  };
  const fig = document.createElement('figure');
  const row = document.createElement('div');
  row.className = 'stills';
  for (const t of times) {
    const host = document.createElement('div');
    host.className = 'still';
    row.appendChild(host);
    noiseSeed(seed);
    const scene = new Scene(host, source);
    scene.displaySeed = seed;
    scene.revealStart = -100;
    scene.resize(640, 300);
    scene.frame(10, t, x, fx);
    scene.canvas.setAttribute('role', 'img');
    scene.canvas.setAttribute('aria-label', `Landscape, seed ${seed}, time ${t}`);
  }
  const cap = document.createElement('figcaption');
  cap.innerHTML = `seed ${seed} · <a href="/?seed=${seed}&x=${x}">open</a>`;
  fig.append(row, cap);
  root.appendChild(fig);
}
