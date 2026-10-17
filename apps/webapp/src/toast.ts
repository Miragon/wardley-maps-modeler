/**
 * Transient feedback (toasts), bottom-centre and colour-coded by kind. Kind is conveyed by a
 * coloured dot + left border AND the message text, never colour alone (accessibility). Styling in
 * style.css (`.toaster` / `.toast`). Every toast closes itself; the timer pauses while the pointer
 * or keyboard focus is on it, so an action such as Undo stays reachable.
 */

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastOptions {
  readonly action?: ToastAction;
  readonly durationMs?: number;
}

export interface ToastHandle {
  dismiss(): void;
}

const DEFAULT_LIFE_MS: Record<ToastKind, number> = {
  info: 2800,
  success: 2800,
  warning: 5000,
  error: 6000,
};
const ACTION_LIFE_MS = 8000;
const LEAVE_FALLBACK_MS = 400;

let toaster: HTMLElement | undefined;

function getToaster(): HTMLElement {
  if (!toaster) {
    toaster = document.createElement('div');
    toaster.className = 'toaster';
    toaster.setAttribute('aria-live', 'polite');
    toaster.popover = 'manual';
    document.body.append(toaster);
  }
  return toaster;
}

/**
 * Modal dialogs live in the top layer, above any z-index. Re-showing the toaster as a popover puts
 * it on top of an open dialog, so feedback given from inside a dialog stays visible.
 */
function raiseToaster(element: HTMLElement): void {
  if (typeof element.showPopover !== 'function') return;
  if (element.matches(':popover-open')) element.hidePopover();
  element.showPopover();
}

function removeToast(element: HTMLElement): void {
  const parent = element.parentElement;
  element.remove();
  if (parent && !parent.children.length && parent.matches(':popover-open')) parent.hidePopover();
}

function button(className: string, label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  return element;
}

export function showToast(
  message: string,
  kind: ToastKind = 'info',
  options: ToastOptions = {},
): ToastHandle {
  const element = document.createElement('div');
  element.className = `toast toast--${kind}`;
  // Errors interrupt (alert); everything else waits for a pause in speech (status).
  element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const dot = document.createElement('span');
  dot.className = 'toast__dot';
  dot.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'toast__text';
  text.textContent = message;
  element.append(dot, text);

  let dismissed = false;
  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    element.classList.add('is-leaving');
    element.addEventListener('animationend', () => removeToast(element), { once: true });
    setTimeout(() => removeToast(element), LEAVE_FALLBACK_MS);
  };

  if (options.action) {
    const { label, onClick } = options.action;
    const action = button('toast__action', label);
    action.addEventListener('click', () => {
      dismiss();
      onClick();
    });
    element.append(action);
  }
  if (kind === 'error') {
    const close = button('toast__close', '×');
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', dismiss);
    element.append(close);
  }
  const container = getToaster();
  container.append(element);
  raiseToaster(container);

  let remaining = options.durationMs ?? (options.action ? ACTION_LIFE_MS : DEFAULT_LIFE_MS[kind]);
  let startedAt = Date.now();
  let timer = setTimeout(dismiss, remaining);
  let paused = false;
  const pause = (): void => {
    if (paused) return;
    paused = true;
    clearTimeout(timer);
    remaining -= Date.now() - startedAt;
  };
  const resume = (): void => {
    if (!paused || dismissed) return;
    if (element.matches(':hover') || element.contains(document.activeElement)) return;
    paused = false;
    startedAt = Date.now();
    timer = setTimeout(dismiss, Math.max(remaining, 1500));
  };
  element.addEventListener('mouseenter', pause);
  element.addEventListener('focusin', pause);
  element.addEventListener('mouseleave', resume);
  element.addEventListener('focusout', () => setTimeout(resume, 0));

  return { dismiss };
}
