/** URL-/Sharing-Helfer: Map (OWM-DSL) als URL-safe Base64 im Hash kodieren. */

/** UTF-8 -> URL-safe Base64 (A-Za-z0-9-_, ohne Padding). Auch fuer PNG-tEXt/SVG-Attribut nutzbar. */
export function encodeMap(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URL-safe Base64 -> UTF-8. */
export function decodeMap(b64: string): string {
  let norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4;
  if (pad) norm += '='.repeat(4 - pad);
  const bin = atob(norm);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const HASH_PREFIX = '#m=';

/** Liest die im Hash kodierte DSL (oder null). */
export function readHashMap(): string | null {
  const h = location.hash;
  if (!h.startsWith(HASH_PREFIX)) return null;
  try {
    return decodeMap(h.slice(HASH_PREFIX.length));
  } catch {
    return null;
  }
}

/** Aktualisiert den Hash mit der aktuellen DSL (ohne History-Eintrag). */
export function writeHashMap(dsl: string): void {
  history.replaceState(null, '', HASH_PREFIX + encodeMap(dsl));
}

/** Vollstaendige teilbare URL fuer die gegebene DSL. */
export function shareUrl(dsl: string): string {
  return `${location.origin}${location.pathname}${HASH_PREFIX}${encodeMap(dsl)}`;
}
