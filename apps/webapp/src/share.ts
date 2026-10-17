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

/**
 * What a URL hash holds: no map at all (`none`, e.g. `#section-2`), a readable map (`ok`), or a map
 * link that cannot be decoded (`corrupt`, typically a link truncated by a mail or chat client).
 */
export type HashMapResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'ok'; readonly dsl: string }
  | { readonly kind: 'corrupt' };

/** Decodes the map in a hash (compressed `#mz=` or legacy `#m=`). */
export async function readHashMap(hash: string = location.hash): Promise<HashMapResult> {
  const payload = hash.startsWith(HASH_PREFIX_COMPRESSED)
    ? hash.slice(HASH_PREFIX_COMPRESSED.length)
    : hash.startsWith(HASH_PREFIX_LEGACY)
      ? hash.slice(HASH_PREFIX_LEGACY.length)
      : undefined;
  if (payload === undefined) return { kind: 'none' };
  try {
    const dsl = hash.startsWith(HASH_PREFIX_COMPRESSED)
      ? await decodeMapCompressed(payload)
      : decodeMap(payload);
    return dsl.trim() ? { kind: 'ok', dsl } : { kind: 'corrupt' };
  } catch {
    return { kind: 'corrupt' };
  }
}

/**
 * Finds a share link in pasted text (`https://…#mz=…` or just the hash) and decodes it. Text that
 * contains no map link at all is `none`.
 */
export function readShareLink(text: string): Promise<HashMapResult> {
  const match = /#mz?=[A-Za-z0-9_-]*/.exec(text.trim());
  return match ? readHashMap(match[0]) : Promise.resolve({ kind: 'none' });
}

/** Updates the hash with an already encoded (compressed) map, without a history entry. */
export function writeHashPayload(payload: string): void {
  history.replaceState(null, '', HASH_PREFIX_COMPRESSED + payload);
}

/** Updates the hash with the current DSL (no history entry). */
export async function writeHashMap(dsl: string): Promise<void> {
  writeHashPayload(await encodeMapCompressed(dsl));
}

/** Full shareable URL for an already encoded (compressed) map. */
export function shareUrlForPayload(payload: string): string {
  return `${location.origin}${location.pathname}${HASH_PREFIX_COMPRESSED}${payload}`;
}

/** Full shareable URL for the given DSL. */
export async function shareUrl(dsl: string): Promise<string> {
  return shareUrlForPayload(await encodeMapCompressed(dsl));
}
