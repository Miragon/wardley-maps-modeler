import type { Modeler } from '@miragon/wardley-renderer';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasService {
  viewbox(box?: ViewBox): ViewBox;
  zoom(): number;
  resized(): void;
}

interface GridService {
  outerBounds(): ViewBox;
}

/** Below this width the palette drops to a second row under the corner chrome (see style.css). */
export const NARROW_LAYOUT_MAX_WIDTH = 760;

/** Room the floating chrome needs around the fitted map (palette on top, zoom bottom right). */
const INSET = { top: 76, side: 28, bottom: 60 };
const NARROW_INSET_TOP = 124;

/**
 * Fits the map into the panel and keeps it fitted while the panel is resized (split editors, the
 * sidebar or the bottom panel opening) — until the user zooms or pans, from then on their view
 * wins. Programmatic viewbox changes (fit, restoring the view after an import) are told apart from
 * the user's by a re-entrancy counter: diagram-js fires `canvas.viewbox.changed` synchronously.
 */
export class Viewport {
  private programmaticChanges = 0;
  private userMovedView = false;
  private active = false;
  private readonly canvas: CanvasService;
  private readonly grid: GridService;

  constructor(
    private readonly modeler: Modeler,
    private readonly container: HTMLElement,
    onZoomChanged: (zoom: number) => void,
  ) {
    this.canvas = modeler.get<CanvasService>('canvas');
    this.grid = modeler.get<GridService>('evolutionGrid');
    modeler.on('canvas.viewbox.changed', () => {
      if (this.programmaticChanges === 0) this.userMovedView = true;
      onZoomChanged(this.canvas.zoom());
    });
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.onResize());
    }).observe(container);
  }

  /** Runs `change` without counting the viewbox changes it causes as the user's. */
  programmatic<T>(change: () => T): T {
    this.programmaticChanges++;
    try {
      return change();
    } finally {
      this.programmaticChanges--;
    }
  }

  fit(): void {
    if (!this.active) return;
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    const plot = this.grid.outerBounds();
    const top = width <= NARROW_LAYOUT_MAX_WIDTH ? NARROW_INSET_TOP : INSET.top;
    const availableWidth = Math.max(width - 2 * INSET.side, 50);
    const availableHeight = Math.max(height - top - INSET.bottom, 50);
    const scale = Math.min(availableWidth / plot.width, availableHeight / plot.height);
    this.programmatic(() =>
      this.canvas.viewbox({
        x: plot.x + plot.width / 2 - width / 2 / scale,
        y: plot.y - top / scale, // top edge below the chrome
        width: width / scale,
        height: height / scale,
      }),
    );
    this.userMovedView = false;
  }

  current(): ViewBox | undefined {
    try {
      const { x, y, width, height } = this.canvas.viewbox();
      return { x, y, width, height };
    } catch {
      return undefined;
    }
  }

  restore(box: ViewBox): void {
    try {
      this.programmatic(() => this.canvas.viewbox(box));
    } catch {
      /* no canvas yet -> ignore */
    }
  }

  stepZoom(direction: 1 | -1): void {
    if (!this.active) return;
    this.modeler.get<{ stepZoom(delta: number): void }>('zoomScroll').stepZoom(direction);
  }

  /** Called once the first map is imported: there is nothing to fit or zoom before. */
  activate(): void {
    this.active = true;
  }

  private onResize(): void {
    if (!this.active) return;
    const { width, height } = this.container.getBoundingClientRect();
    // A hidden tab (retainContextWhenHidden) reports 0×0; fitting to that would lose the view.
    if (!width || !height) return;
    this.programmatic(() => this.canvas.resized());
    if (!this.userMovedView) this.fit();
  }
}
