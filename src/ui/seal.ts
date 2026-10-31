// The seal: a small red ASCII-boxed stamp with the seed, settling into the
// lower right once the painting has resolved.

export class Seal {
  readonly el: HTMLElement;
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'seal';
    this.el.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.el);
  }

  static lines(seed: number): string[] {
    const label = String(seed);
    const bar = '-'.repeat(label.length + 2);
    return [`+${bar}+`, `| ${label} |`, `+${bar}+`];
  }

  set(seed: number): void {
    this.el.textContent = Seal.lines(seed).join('\n');
  }

  show(on: boolean): void {
    this.el.classList.toggle('settled', on);
  }
}
