import { iconMarkup, ICON_MENU } from '@miragon/wardley-renderer';

export interface MenuAction {
  icon: string;
  label: string;
  run: () => void;
}

/** A row in the dropdown: an action, a separator, or a custom element (e.g. the size control). */
export type MenuEntry = MenuAction | 'separator' | HTMLElement;

const NAVIGABLE = '.menu-item, select, input, button.chip-btn:not([disabled])';

/**
 * Collapsed hamburger menu, top left (Excalidraw style, as in the webapp). Closes on outside click
 * and Escape and returns focus to its button; arrow keys move between the entries.
 */
export class Menu {
  readonly button: HTMLButtonElement;
  private readonly dropdown: HTMLElement;
  private readonly openListeners: Array<() => void> = [];

  constructor(host: HTMLElement, entries: readonly MenuEntry[]) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'chrome-btn menu-btn';
    this.button.title = 'Menu';
    this.button.setAttribute('aria-label', 'Menu');
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.innerHTML = iconMarkup(ICON_MENU, 18);

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'menu-dropdown';
    this.dropdown.setAttribute('role', 'menu');
    this.dropdown.setAttribute('aria-label', 'Map');
    this.dropdown.hidden = true;
    for (const entry of entries) this.dropdown.append(this.render(entry));

    host.append(this.button, this.dropdown);
    this.bind(host);
  }

  get isOpen(): boolean {
    return !this.dropdown.hidden;
  }

  onOpen(listener: () => void): void {
    this.openListeners.push(listener);
  }

  setOpen(open: boolean, { focusButton = false } = {}): void {
    if (open === this.isOpen) return;
    this.dropdown.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      for (const listener of this.openListeners) listener();
      this.dropdown.querySelector<HTMLElement>(NAVIGABLE)?.focus();
    } else if (focusButton) {
      this.button.focus();
    }
  }

  private render(entry: MenuEntry): HTMLElement {
    if (entry === 'separator') {
      const separator = document.createElement('div');
      separator.className = 'menu-sep';
      separator.setAttribute('role', 'separator');
      return separator;
    }
    if (entry instanceof HTMLElement) return entry;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'menu-item';
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `${iconMarkup(entry.icon, 16)}<span>${entry.label}</span>`;
    item.addEventListener('click', () => {
      this.setOpen(false);
      entry.run();
    });
    return item;
  }

  private bind(host: HTMLElement): void {
    this.button.addEventListener('click', () => this.setOpen(!this.isOpen));
    document.addEventListener('pointerdown', (e) => {
      if (this.isOpen && !host.contains(e.target as Node | null)) this.setOpen(false);
    });
    this.dropdown.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.setOpen(false, { focusButton: true });
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Selects and number fields use the arrows themselves.
        if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        this.moveFocus(e.key === 'ArrowDown' ? 1 : -1);
      }
    });
  }

  private moveFocus(step: 1 | -1): void {
    const entries = [...this.dropdown.querySelectorAll<HTMLElement>(NAVIGABLE)];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const next = entries[(index + step + entries.length) % entries.length];
    next?.focus();
  }
}
