// S: save the current view as .txt (the grid as text; it doubles as a text
// alternative of the painting) and .png (at device resolution, with the seal).

import { FONT_FAMILY } from '../render/atlas';
import { Seal } from './seal';

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function viewText(lines: string[], seed: number, x: number): string {
  return `${lines.join('\n')}\n\nseed ${seed} · x ${Math.round(x)} · inkscroll · landscape generator after shan-shui-inf by Lingdong Huang\n`;
}

export function saveText(lines: string[], seed: number, x: number): void {
  download(new Blob([viewText(lines, seed, x)], { type: 'text/plain;charset=utf-8' }), `inkscroll-${seed}-${Math.round(x)}.txt`);
}

export function savePng(canvas: HTMLCanvasElement, seed: number, x: number, seal: { el: HTMLElement; color: string }, dpr: number): Promise<void> {
  // Draw the seal where it sits on screen.
  const ctx = canvas.getContext('2d')!;
  const r = seal.el.getBoundingClientRect();
  if (r.width > 0) {
    const cs = getComputedStyle(seal.el);
    const size = parseFloat(cs.fontSize) * dpr;
    const lh = parseFloat(cs.lineHeight) * dpr || size * 1.2;
    ctx.font = `${size}px ${FONT_FAMILY}`;
    ctx.fillStyle = seal.color;
    ctx.textBaseline = 'top';
    Seal.lines(seed).forEach((l, i) => ctx.fillText(l, r.left * dpr + parseFloat(cs.paddingLeft) * dpr, r.top * dpr + parseFloat(cs.paddingTop) * dpr + i * lh));
  }
  return new Promise((resolve) =>
    canvas.toBlob((b) => {
      if (b) download(b, `inkscroll-${seed}-${Math.round(x)}.png`);
      resolve();
    }, 'image/png'),
  );
}
