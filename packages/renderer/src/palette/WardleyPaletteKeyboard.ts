import type EventBus from 'diagram-js/lib/core/EventBus';
import type Palette from 'diagram-js/lib/features/palette/Palette';
import type WardleyPaletteProvider from './WardleyPaletteProvider.js';

const ENTRY_SELECTOR = '.djs-palette-entries .entry';

const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const ACTIVATE_KEYS = new Set(['Enter', ' ']);

/**
 * Makes the palette a keyboard-operable toolbar (WAI-ARIA toolbar pattern): one Tab stop with a
 * roving tabindex, arrow keys / Home / End move between tools, Enter or Space activates the focused
 * one. A create tool has no pointer position to attach the new element to, so it is placed at the
 * centre of the visible plot instead (see `WardleyPaletteProvider.createAtVisibleCenter`).
 */
export default class WardleyPaletteKeyboard {
  static $inject = ['eventBus', 'palette', 'wardleyPaletteProvider'];

  private container: HTMLElement | undefined;
  private activeAction: string | undefined;

  constructor(
    eventBus: EventBus,
    private readonly palette: Palette,
    private readonly provider: WardleyPaletteProvider,
  ) {
    eventBus.on('palette.create', (event: { container: HTMLElement }) =>
      this.attach(event.container),
    );
    eventBus.on('palette.changed', () => this.updateTabStops());
    const existing = (palette as unknown as { _container?: HTMLElement })._container;
    if (existing) this.attach(existing);
  }

  private attach(container: HTMLElement): void {
    if (this.container === container) return;
    this.container = container;
    // Scopes the toolbar styling to this palette, not every diagram-js palette on the page.
    container.classList.add('wardley-palette');
    container.setAttribute('role', 'toolbar');
    container.setAttribute('aria-label', 'Tools');
    container.setAttribute('aria-orientation', 'horizontal');
    container.addEventListener('keydown', (event) => this.onKeydown(event));
    container.addEventListener('focusin', (event) => {
      const entry = this.entryOf(event.target);
      if (!entry) return;
      this.activeAction = entry.getAttribute('data-action') ?? undefined;
      this.updateTabStops();
    });
    this.updateTabStops();
  }

  private entries(): HTMLElement[] {
    return this.container
      ? Array.from(this.container.querySelectorAll<HTMLElement>(ENTRY_SELECTOR))
      : [];
  }

  private entryOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element) || !this.container) return null;
    const entry = target.closest<HTMLElement>('.entry');
    return entry && this.container.contains(entry) ? entry : null;
  }

  private updateTabStops(): void {
    const entries = this.entries();
    if (!entries.length) return;
    const active =
      entries.find((entry) => entry.getAttribute('data-action') === this.activeAction) ??
      entries[0]!;
    for (const entry of entries) entry.tabIndex = entry === active ? 0 : -1;
  }

  private onKeydown(event: KeyboardEvent): void {
    const entry = this.entryOf(event.target);
    if (!entry || event.altKey || event.ctrlKey || event.metaKey) return;
    const entries = this.entries();
    const index = entries.indexOf(entry);

    let next: HTMLElement | undefined;
    if (PREVIOUS_KEYS.has(event.key)) next = entries[(index - 1 + entries.length) % entries.length];
    else if (NEXT_KEYS.has(event.key)) next = entries[(index + 1) % entries.length];
    else if (event.key === 'Home') next = entries[0];
    else if (event.key === 'End') next = entries[entries.length - 1];

    if (next) {
      // Stop here so the document-level shortcuts (arrow-key nudge) do not also move the selection.
      event.preventDefault();
      event.stopPropagation();
      next.focus();
      return;
    }

    if (ACTIVATE_KEYS.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      this.activate(entry);
    }
  }

  private activate(entry: HTMLElement): void {
    const action = entry.getAttribute('data-action');
    if (!action) return;
    if (this.provider.createAtVisibleCenter(action)) return;
    const bounds = entry.getBoundingClientRect();
    const click = new MouseEvent('click', {
      bubbles: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    });
    this.palette.triggerEntry(action, 'click', click);
  }
}
