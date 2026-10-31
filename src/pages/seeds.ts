// Phase 2 taste gate: five seeds side by side as stills.
import '../style.css';
import './pages.css';
import { renderStill } from './still';

const params = new URLSearchParams(location.search);
const seeds = (params.get('seeds') ?? '123456,777,424242,31415,900001').split(',').map(Number).filter(Number.isFinite);
const x = Number(params.get('x') ?? 2000);
const root = document.getElementById('sheet')!;

(async () => {
  await Promise.all([document.fonts.load('16px "JetBrains Mono"'), document.fonts.load('700 16px "JetBrains Mono"')]);
  for (const seed of seeds) {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Landscape, seed ${seed}`);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `seed ${seed} · <a href="/?seed=${seed}&x=${x}">open</a>`;
    fig.append(canvas, cap);
    root.appendChild(fig);
    await new Promise((r) => setTimeout(r, 0));
    renderStill(canvas, seed, x, 180, 5);
  }
})();
