/**
 * DOM-free PNG/encoding helpers for the EMBEDDED Wardley scene (OWM-DSL).
 *
 * Used by BOTH sides:
 *  - Extension host (Node): reads `.wmap.png`/`.owm.png` bytes and extracts the DSL (`pngExtractText`
 *    + `decodeMap`) to send it to the webview as `init`.
 *  - Webview (browser): rasterizes the SVG to PNG and embeds the DSL (`pngInsertText` + `encodeMap`).
 *
 * All functions work without the DOM (only `TextEncoder`/`TextDecoder`/`atob`/`btoa`, available
 * globally in Node ≥18 and the browser). The encoding is identical to the demo webapp (apps/webapp/src/*).
 */

/** PNG tEXt keyword under which the embedded scene is stored. */
export const EMBED_KEYWORD = 'wardley-map';

/** UTF-8 -> URL-safe Base64 (A-Za-z0-9-_, ohne Padding). */
export function encodeMap(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URL-safe Base64 -> UTF-8 (counterpart to `encodeMap`). */
export function decodeMap(b64: string): string {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function latin1(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

/** Inserts a tEXt chunk (keyword\0text) before IEND. */
export function pngInsertText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  const data = new Uint8Array([...latin1(keyword), 0, ...latin1(text)]);
  const type = latin1('tEXt');
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(new Uint8Array([...type, ...data])));

  const iendStart = findIend(png);
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, iendStart), 0);
  out.set(chunk, iendStart);
  out.set(png.subarray(iendStart), iendStart + chunk.length);
  return out;
}

/** Reads the text of the FIRST tEXt chunk with the given keyword (or null if none exists). */
export function pngExtractText(png: Uint8Array, keyword: string): string | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8; // skip the PNG signature
  while (off + 8 <= png.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!);
    const dataStart = off + 8;
    if (type === 'tEXt') {
      const data = png.subarray(dataStart, dataStart + len);
      const nul = data.indexOf(0);
      if (nul >= 0) {
        const key = String.fromCharCode(...data.subarray(0, nul));
        if (key === keyword) return latin1Decode(data.subarray(nul + 1));
      }
    }
    if (type === 'IEND') break;
    off = dataStart + len + 4; // + CRC
  }
  return null;
}

/** Latin-1 bytes -> string (in chunks, so even large texts don't blow the call stack). */
function latin1Decode(bytes: Uint8Array): string {
  let out = '';
  // 0x8000 (32 KiB) stays comfortably under the spread-argument limit (~64–128k) and prevents
  // "Maximum call stack size exceeded" for large embedded maps.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function findIend(png: Uint8Array): number {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8;
  while (off + 8 <= png.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!);
    if (type === 'IEND') return off;
    off += 12 + len;
  }
  return png.length;
}
