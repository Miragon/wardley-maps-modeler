/**
 * A refused value in an inline editor: the field turns red and a caption under it says why. One look
 * and one accessible pattern (role=alert, aria-describedby) for every editor, also for keyboard and
 * touch users who never see a tooltip.
 */
export interface FieldError {
  show(message: string): void;
  clear(): void;
  /** The caption while shown, for hosts that lay out further captions below it. */
  readonly caption: HTMLElement | undefined;
}

export function createFieldError(
  container: HTMLElement,
  field: HTMLInputElement | HTMLTextAreaElement,
  id: string,
  place: (caption: HTMLElement) => void,
): FieldError {
  let caption: HTMLElement | undefined;
  return {
    get caption() {
      return caption;
    },
    show(message) {
      if (!caption) {
        caption = document.createElement('div');
        caption.className = 'wardley-label-caption wardley-label-error';
        caption.setAttribute('role', 'alert');
        caption.id = id;
        container.appendChild(caption);
        field.setAttribute('aria-describedby', id);
      }
      caption.textContent = message;
      field.classList.add('wardley-label-input--error');
      field.setAttribute('aria-invalid', 'true');
      place(caption);
    },
    clear() {
      if (!caption) return;
      caption.remove();
      caption = undefined;
      field.classList.remove('wardley-label-input--error');
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    },
  };
}
