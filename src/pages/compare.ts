// Phase 1 check: the port's primitives drawn as plain vectors, beside the
// original (embedded) at the same seed. The original seeds a different PRNG,
// so the two are different landscapes in the same style, not the same one.
import '../style.css';
import './pages.css';
import { buildConfig, config, PAPER } from '../config';
import { elementsFor } from '../render/build';
import { noiseSeed } from '../world/noise';
import { worldOptions } from '../world/options';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 123456);
const x0 = Number(params.get('x') ?? 0);
const width = 1500;

const canvas = document.getElementById('port') as HTMLCanvasElement;
const frame = document.getElementById('orig') as HTMLIFrameElement;
frame.src = `https://shan-shui-inf.lingdong.works/?seed=${seed}`;
document.getElementById('seed')!.textContent = String(seed);

const dpr = Math.min(2, window.devicePixelRatio || 1);
const scale = 0.8;
canvas.width = width * scale * dpr;
canvas.height = 700 * scale * dpr;
canvas.style.width = `${width * scale}px`;
// Like the original: normal compositing on white inside the drawing, and the
// whole drawing multiplied onto paper.
const ink = document.createElement('canvas');
ink.width = canvas.width;
ink.height = canvas.height;
const ctx = ink.getContext('2d')!;
ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, ink.width, ink.height);
ctx.scale(scale * dpr, scale * dpr);
ctx.translate(-x0, 0);

noiseSeed(seed);
worldOptions.whimsy = params.get('whimsy') === '1';
const cfg = buildConfig(config);
const draw = (layer: 'background' | 'foreground', shift: number) => {
  const cw = config.chunkPx * config.unitsPerPx;
  const els = [];
  for (let c = Math.floor((x0 + shift) / cw) - 1; c <= Math.ceil((x0 + shift + width) / cw); c++) els.push(...elementsFor(seed, layer, c, c * cw, (c + 1) * cw, cfg));
  const uniq = [...new Map(els.map((e) => [`${e.placement.tag}${e.placement.chunk}:${e.placement.idx}`, e])).values()];
  uniq.sort((a, b) => a.placement.depth - b.placement.depth || a.placement.x - b.placement.x);
  ctx.save();
  ctx.translate(-shift, 0);
  for (const e of uniq) {
    for (const p of e.prims) {
      if (p.kind === 'line') continue;
      const g = Math.round(255 * (1 - p.ink));
      const col = `rgba(${g},${g},${g},${p.alpha})`;
      ctx.beginPath();
      for (let k = 0; k < p.points.length; k += 2) (k ? ctx.lineTo : ctx.moveTo).call(ctx, p.points[k], p.points[k + 1]);
      if (p.kind === 'fill') {
        ctx.fillStyle = col;
        ctx.fill();
        if (p.width > 0) {
          ctx.strokeStyle = col;
          ctx.lineWidth = p.width;
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = col;
        ctx.lineWidth = p.width;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
};
draw('background', 0);
draw('foreground', 0);
const out = canvas.getContext('2d')!;
out.fillStyle = PAPER;
out.fillRect(0, 0, canvas.width, canvas.height);
out.globalCompositeOperation = 'multiply';
out.drawImage(ink, 0, 0);
