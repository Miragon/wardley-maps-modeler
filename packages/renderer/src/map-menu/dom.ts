/** Lucide `x` (lucide-static 1.59.0, ISC; derived from Feather, MIT) at the chrome size of §5.14. */
export const CLOSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

/** Ids stay unique when two maps share a page (two webviews never do, a web page may). */
let nextId = 0;
export function uniqueId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}
