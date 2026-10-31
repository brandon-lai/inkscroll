// ?debug=1: overlays (chunk borders, material map, raw ink map, frame time),
// effect toggles, and live sliders for the tunables in config.ts. Changing a
// build tunable rebuilds every chunk; motion tunables apply immediately.

import { config } from '../config';

type Num = { key: string; min: number; max: number; step: number; build?: boolean };

const SLIDERS: Num[] = [
  { key: 'inkMax', min: 0.1, max: 0.7, step: 0.01, build: true },
  { key: 'inkGamma', min: 0.4, max: 1.6, step: 0.05, build: true },
  { key: 'inkFloor', min: 0, max: 0.1, step: 0.002, build: true },
  { key: 'edgeMag', min: 0.005, max: 0.3, step: 0.005, build: true },
  { key: 'edgeFrac', min: 0.05, max: 0.8, step: 0.01, build: true },
  { key: 'edgeAgree', min: 0.2, max: 1, step: 0.05, build: true },
  { key: 'edgeInkMin', min: 0, max: 0.3, step: 0.01, build: true },
  { key: 'lineMin', min: 0.1, max: 1, step: 0.05, build: true },
  { key: 'ridgeTone', min: 0, max: 1, step: 0.05, build: true },
  { key: 'edgeLinks', min: 0, max: 4, step: 1, build: true },
  { key: 'lineTone', min: 0, max: 1, step: 0.05, build: true },
  { key: 'depthFade', min: 0.2, max: 1, step: 0.05, build: true },
  { key: 'dither', min: 0, max: 1, step: 0.05, build: true },
  { key: 'parallax', min: 0, max: 1, step: 0.05 },
  { key: 'driftSpeed', min: 0, max: 80, step: 1 },
  { key: 'waterSpeed', min: 0, max: 2, step: 0.02 },
  { key: 'waterScale', min: 0.02, max: 0.5, step: 0.01 },
  { key: 'mistThreshold', min: 0.4, max: 0.95, step: 0.01 },
  { key: 'swayThreshold', min: 0.5, max: 0.99, step: 0.01 },
  { key: 'breatheRate', min: 0, max: 0.02, step: 0.0005 },
];

export interface DebugState {
  borders: boolean;
  materials: boolean;
  ink: boolean;
  frameTime: boolean;
}

export class DebugPanel {
  readonly el: HTMLElement;
  readonly state: DebugState = { borders: false, materials: false, ink: false, frameTime: true };
  private statsEl: HTMLElement;

  constructor(parent: HTMLElement, onRebuild: () => void, onOverlay: () => void) {
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

    for (const k of Object.keys(this.state) as (keyof DebugState)[]) {
      const d = row(`<label><input type="checkbox" ${this.state[k] ? 'checked' : ''}> ${k}</label>`);
      d.querySelector('input')!.addEventListener('change', (e) => {
        // materials and ink share the overlay; one at a time
        this.state[k] = (e.target as HTMLInputElement).checked;
        if (k === 'materials' && this.state.materials) this.setBox('ink', false);
        if (k === 'ink' && this.state.ink) this.setBox('materials', false);
        onOverlay();
      });
      d.dataset.key = k;
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

  private setBox(k: keyof DebugState, v: boolean): void {
    this.state[k] = v;
    const input = this.el.querySelector<HTMLInputElement>(`[data-key="${k}"] input`);
    if (input) input.checked = v;
  }

  setStats(text: string): void {
    this.statsEl.textContent = text;
    this.statsEl.style.display = this.state.frameTime ? '' : 'none';
  }
}
