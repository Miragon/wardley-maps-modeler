/**
 * Hamburger menu as a disclosure: a button with aria-expanded controlling a panel of plain buttons
 * and fields (a select and number inputs live in it, so the ARIA menu pattern does not fit).
 * Opening focuses the first item, Escape returns focus to the button, and the panel closes when
 * focus or a click leaves it.
 */

export interface AppMenu {
  close(options?: { restoreFocus?: boolean }): void;
  isOpen(): boolean;
  /** Runs `action` when the item is clicked, after closing the menu. */
  onItem(id: string, action: () => void): void;
  readonly button: HTMLElement;
}

const ITEM_SELECTOR = 'button:not(:disabled):not([hidden]), select, input';

export function setupMenu(button: HTMLElement, panel: HTMLElement): AppMenu {
  const inside = (node: Node | null): boolean =>
    !!node && (button.contains(node) || panel.contains(node));
  const items = (): HTMLElement[] =>
    [...panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR)].filter(
      (item) => item.offsetParent !== null,
    );

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };

  const close = (options: { restoreFocus?: boolean } = {}): void => {
    if (panel.hidden) return;
    setOpen(false);
    if (options.restoreFocus) button.focus();
  };

  button.addEventListener('click', () => {
    if (!panel.hidden) {
      close();
      return;
    }
    setOpen(true);
    items()[0]?.focus();
  });

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ restoreFocus: true });
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target as HTMLElement;
    // Selects and number inputs use the arrow keys themselves.
    if (target.matches('select, input')) return;
    event.preventDefault();
    const list = items().filter((item) => item instanceof HTMLButtonElement);
    const index = list.indexOf(target as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    list[(index + step + list.length) % list.length]?.focus();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  panel.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (next && !inside(next)) close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!inside(event.target as Node)) close();
  });

  return {
    button,
    close,
    isOpen: () => !panel.hidden,
    onItem(id, action) {
      document.getElementById(id)?.addEventListener('click', (event) => {
        // Keyboard users keep their place on the Menu button; after a pointer click focus drops to
        // the page, where the canvas shortcuts keep working.
        close({ restoreFocus: event.detail === 0 });
        action();
      });
    },
  };
}
