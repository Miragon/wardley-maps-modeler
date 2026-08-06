/**
 * URL/sharing helpers: encode the map (OWM-DSL) compressed (deflate-raw, browser-native — no CDN, GDPR)
 * as URL-safe Base64 in the hash. Uncompressed legacy links (`#m=`) are still read. This is the
 * webapp's way to share an editable map — a link, not an image.
 */

/** Bytes -> URL-safe Base64 (A-Za-z0-9-_, no padding). */
function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): Uint8Array {
  let norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4;
  if (pad) norm += '='.repeat(4 - pad);
  const bin = atob(norm);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: ReadableWritablePair): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/** UTF-8 -> URL-safe Base64 (uncompressed, legacy `#m=` links). */
export function encodeMap(text: string): string {
  return toBase64Url(new TextEncoder().encode(text));
}

/** URL-safe Base64 -> UTF-8 (uncompressed). */
export function decodeMap(b64: string): string {
  return new TextDecoder().decode(fromBase64Url(b64));
}

/** UTF-8 -> deflate-raw -> URL-safe Base64. Real-world maps shrink by ~5-8x. */
export async function encodeMapCompressed(text: string): Promise<string> {
  const deflated = await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw'));
  return toBase64Url(deflated);
}

/** URL-safe Base64 -> inflate -> UTF-8. */
export async function decodeMapCompressed(b64: string): Promise<string> {
  const inflated = await pipe(fromBase64Url(b64), new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(inflated);
}

const HASH_PREFIX_COMPRESSED = '#mz=';
const HASH_PREFIX_LEGACY = '#m=';

/** Reads the DSL encoded in the hash (compressed `#mz=` or legacy `#m=`) — or null. */
export async function readHashMap(): Promise<string | null> {
  const h = location.hash;
  try {
    if (h.startsWith(HASH_PREFIX_COMPRESSED)) {
      return await decodeMapCompressed(h.slice(HASH_PREFIX_COMPRESSED.length));
    }
    if (h.startsWith(HASH_PREFIX_LEGACY)) {
      return decodeMap(h.slice(HASH_PREFIX_LEGACY.length));
    }
  } catch {
    return null;
  }
  return null;
}

/** Updates the hash with the current DSL (no history entry). */
export async function writeHashMap(dsl: string): Promise<void> {
  history.replaceState(null, '', HASH_PREFIX_COMPRESSED + (await encodeMapCompressed(dsl)));
}

/** Full shareable URL for the given DSL. */
export async function shareUrl(dsl: string): Promise<string> {
  const encoded = await encodeMapCompressed(dsl);
  return `${location.origin}${location.pathname}${HASH_PREFIX_COMPRESSED}${encoded}`;
}
