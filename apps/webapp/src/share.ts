/** URL/sharing helpers: encode the map (OWM-DSL) as URL-safe Base64 in the hash. */

/** UTF-8 -> URL-safe Base64 (A-Za-z0-9-_, no padding). Also usable for the PNG tEXt / SVG attribute. */
export function encodeMap(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeMap(b64: string): string {
  let norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4;
  if (pad) norm += '='.repeat(4 - pad);
  const bin = atob(norm);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const HASH_PREFIX = '#m=';

export function readHashMap(): string | null {
  const h = location.hash;
  if (!h.startsWith(HASH_PREFIX)) return null;
  try {
    return decodeMap(h.slice(HASH_PREFIX.length));
  } catch {
    return null;
  }
}

/** Updates the hash with the current DSL (no history entry). */
export function writeHashMap(dsl: string): void {
  history.replaceState(null, '', HASH_PREFIX + encodeMap(dsl));
}

export function shareUrl(dsl: string): string {
  return `${location.origin}${location.pathname}${HASH_PREFIX}${encodeMap(dsl)}`;
}
