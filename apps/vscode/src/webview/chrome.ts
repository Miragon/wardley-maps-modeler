const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';

function chromeButton(className: string, text: string, title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.title = title;
  return button;
}

/** Bottom-right zoom group like the webapp: −, the zoom level (click = fit), +. */
export class ZoomControls {
  private readonly level: HTMLButtonElement;

  constructor(host: HTMLElement, actions: { zoomIn(): void; zoomOut(): void; fit(): void }) {
    const group = document.createElement('div');
    group.className = 'zoom';
    group.setAttribute('role', 'toolbar');
    group.setAttribute('aria-label', 'Zoom');
    const zoomOut = chromeButton('zoom-btn', '−', `Zoom out (${MOD}−)`);
    zoomOut.setAttribute('aria-label', 'Zoom out');
    this.level = chromeButton('zoom-btn zoom-level', '100%', `Fit map to view (${MOD}0)`);
    const zoomIn = chromeButton('zoom-btn', '+', `Zoom in (${MOD}+)`);
    zoomIn.setAttribute('aria-label', 'Zoom in');
    zoomOut.addEventListener('click', () => actions.zoomOut());
    this.level.addEventListener('click', () => actions.fit());
    zoomIn.addEventListener('click', () => actions.zoomIn());
    group.append(zoomOut, this.level, zoomIn);
    host.append(group);
  }

  show(zoom: number): void {
    const percent = `${Math.round(zoom * 100)}%`;
    this.level.textContent = percent;
    this.level.setAttribute('aria-label', `Zoom ${percent}, fit map to view`);
  }
}

/**
 * Bottom-left pill with the number of parser problems (hidden when there are none). The lenient
 * parser drops statements it cannot read, so without it a typo would only make shapes vanish.
 */
export class ProblemsIndicator {
  private readonly button: HTMLButtonElement;

  constructor(host: HTMLElement, openProblems: () => void) {
    this.button = chromeButton('problems', '', 'Show in the Problems view');
    this.button.hidden = true;
    this.button.addEventListener('click', openProblems);
    host.append(this.button);
  }

  show(count: number): void {
    this.button.hidden = count === 0;
    const label = count === 1 ? '1 problem' : `${count} problems`;
    const dot = document.createElement('span');
    dot.className = 'problems-dot';
    dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    this.button.replaceChildren(dot, text);
    this.button.setAttribute('aria-label', `${label} in this map. Show in the Problems view`);
  }
}
