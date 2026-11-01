// ?debug=1: frame stats, a time-of-day scrubber, effect toggles, and live
// sliders for the tunables in config.ts. Build tunables rebuild every chunk.

import { config } from '../config';

type Num = { key: string; min: number; max: number; step: number; build?: boolean };

const SLIDERS: Num[] = [
  { key: 'horizonY', min: 200, max: 400, step: 2, build: true },
  { key: 'lineMin', min: 0.1, max: 1, step: 0.02, build: true },
  { key: 'inkShade', min: 0, max: 20, step: 0.5, build: true },
  { key: 'reflectPx', min: 0, max: 120, step: 2, build: true },
  { key: 'waterfallChance', min: 0, max: 1, step: 0.05, build: true },
  { key: 'depthFar', min: 100, max: 600, step: 10, build: true },
  { key: 'parallax', min: 0, max: 1, step: 0.05 },
  { key: 'farParallax', min: 0, max: 1, step: 0.02 },
  { key: 'driftSpeed', min: 0, max: 80, step: 1 },
  { key: 'dayLength', min: 20, max: 900, step: 10 },
  { key: 'boatDrift', min: 0, max: 80, step: 1 },
];

export class DebugPanel {
  readonly el: HTMLElement;
  private statsEl: HTMLElement;

  constructor(parent: HTMLElement, onRebuild: () => void, onTime: (t: number) => void) {
    this.el = document.createElement('aside');
    this.el.className = 'debug';
    this.el.setAttribute('aria-label', 'Debug panel');
    const row = (html: string) => {
      const d = document.createElement('div');
      d.className = 'debug-row';
      d.innerHTML = html;
      this.el.appendChild(d);
      return d;
    };
    row('<strong>debug</strong>');
    this.statsEl = row('');
    this.statsEl.className = 'debug-stats';
    {
      const d = row('<label>time of day <output>-</output><input type="range" min="0" max="1" step="0.005" value="0.6"></label>');
      const input = d.querySelector('input')!;
      input.addEventListener('input', () => {
        onTime(Number(input.value));
        d.querySelector('output')!.textContent = input.value;
      });
    }
    row('<em>effects</em>');
    for (const k of Object.keys(config.motion) as (keyof typeof config.motion)[]) {
      const d = row(`<label><input type="checkbox" ${config.motion[k] ? 'checked' : ''}> ${k}</label>`);
      d.querySelector('input')!.addEventListener('change', (e) => {
        config.motion[k] = (e.target as HTMLInputElement).checked;
      });
    }
    {
      const d = row(`<label><input type="checkbox" ${config.whimsy ? 'checked' : ''}> whimsy</label>`);
      d.querySelector('input')!.addEventListener('change', (e) => {
        config.whimsy = (e.target as HTMLInputElement).checked;
        config.version++;
        onRebuild();
      });
    }
    row('<em>tunables</em>');
    const c = config as unknown as Record<string, number>;
    for (const s of SLIDERS) {
      const d = row(`<label>${s.key} <output>${c[s.key]}</output><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${c[s.key]}"></label>`);
      const input = d.querySelector('input')!;
      const out = d.querySelector('output')!;
      input.addEventListener('input', () => {
        c[s.key] = Number(input.value);
        out.textContent = input.value;
      });
      if (s.build)
        input.addEventListener('change', () => {
          config.version++;
          onRebuild();
        });
    }
    parent.appendChild(this.el);
  }

  setStats(text: string): void {
    this.statsEl.textContent = text;
  }
}
