/**
 * Minimal transient-feedback (toast) system — the webapp had none (only a Share label swap and
 * native alerts). Bottom-center, auto-dismissing, colour-coded by kind. Styling in style.css
 * (`.toaster` / `.toast`). Kind is conveyed by a coloured dot + left border AND the message text,
 * never colour alone (accessibility).
 */

export type ToastKind = 'info' | 'success' | 'error';

let toaster: HTMLElement | undefined;

function getToaster(): HTMLElement {
  if (!toaster) {
    toaster = document.createElement('div');
    toaster.className = 'toaster';
    toaster.setAttribute('role', 'status');
    toaster.setAttribute('aria-live', 'polite');
    document.body.append(toaster);
  }
  return toaster;
}

/** Show a toast. Errors linger a little longer; everything auto-dismisses. */
export function showToast(message: string, kind: ToastKind = 'info', durationMs?: number): void {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  const dot = document.createElement('span');
  dot.className = 'toast__dot';
  dot.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(dot, text);
  getToaster().append(el);

  const life = durationMs ?? (kind === 'error' ? 5000 : 2800);
  const dismiss = (): void => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    /* Fallback if the leave animation is disabled (prefers-reduced-motion). */
    setTimeout(() => el.remove(), 400);
  };
  setTimeout(dismiss, life);
}
