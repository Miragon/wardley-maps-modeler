const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** RFC 3986 scheme prefix; anything without one is a relative reference (e.g. `./other.wmap`). */
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;

// Control characters (incl. tab and line breaks) — browsers drop them while parsing a URL, so
// `java\nscript:` would otherwise slip past the scheme check.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/**
 * Normalises user or file input into an address the OWM DSL can carry losslessly:
 * `url Name [address]` ends at `]`, and a line break would end the definition line.
 */
export function sanitizeLinkUrl(raw: string): string {
  return raw.replace(CONTROL_CHARACTERS, '').replace(/[[\]]/g, '').trim();
}

/**
 * Allowlist for addresses the modeler stores or opens: http(s), mailto, or a relative reference.
 * Shared maps arrive through URLs and files, so a `javascript:` or `data:` address must never reach
 * `window.open`.
 */
export function isAllowedLinkUrl(url: string): boolean {
  const scheme = SCHEME_PATTERN.exec(url)?.[1];
  return scheme === undefined || ALLOWED_SCHEMES.has(`${scheme.toLowerCase()}:`);
}

/** Sanitised address if it is non-empty and allowed, otherwise `undefined`. */
export function safeLinkUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const url = sanitizeLinkUrl(raw);
  return url && isAllowedLinkUrl(url) ? url : undefined;
}
