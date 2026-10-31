// The one text bar: seed, drift, new, save, and the credit. Fades after a few
// seconds without input and comes back on mouse move, key press or focus.

import { config } from '../config';

export interface BarHandlers {
  toggleDrift(): void;
  newPainting(): void;
  save(): void;
}

export class Bar {
  readonly el: HTMLElement;
  private seedEl: HTMLElement;
  private driftBtn: HTMLButtonElement;
  private timer = 0;

  constructor(parent: HTMLElement, h: BarHandlers) {
    this.el = document.createElement('footer');
    this.el.className = 'bar';
    this.el.innerHTML = `
      <span class="bar-seed">seed <span class="bar-seed-value"></span></span>
      <span class="bar-sep" aria-hidden="true">·</span>
      <button type="button" class="bar-drift" aria-pressed="true" aria-keyshortcuts="Space">drift: on</button>
      <button type="button" class="bar-new" aria-keyshortcuts="N">new</button>
      <button type="button" class="bar-save" aria-keyshortcuts="S">save</button>
      <span class="bar-sep" aria-hidden="true">·</span>
      <span class="bar-credit">landscape generator after <a href="https://github.com/LingDong-/shan-shui-inf" target="_blank" rel="noopener">shan-shui-inf</a> by Lingdong Huang</span>`;
    parent.appendChild(this.el);
    this.seedEl = this.el.querySelector('.bar-seed-value')!;
    this.driftBtn = this.el.querySelector('.bar-drift')!;
    this.driftBtn.addEventListener('click', () => h.toggleDrift());
    this.el.querySelector('.bar-new')!.addEventListener('click', () => h.newPainting());
    this.el.querySelector('.bar-save')!.addEventListener('click', () => h.save());
    this.el.addEventListener('focusin', () => this.wake());
    this.el.addEventListener('pointerenter', () => this.wake());
    this.wake();
  }

  setSeed(seed: number): void {
    this.seedEl.textContent = String(seed);
  }

  setDrift(on: boolean): void {
    this.driftBtn.textContent = `drift: ${on ? 'on' : 'off'}`;
    this.driftBtn.setAttribute('aria-pressed', String(on));
  }

  /** Show the bar and restart the idle timer. */
  wake(): void {
    this.el.classList.remove('idle');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (this.el.matches(':focus-within, :hover')) return this.wake();
      this.el.classList.add('idle');
    }, config.barIdleMs);
  }
}
