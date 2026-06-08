/**
 * DOM-freie PNG-/Encoding-Helfer für die EINGEBETTETE Wardley-Szene (OWM-DSL).
 *
 * Wird von BEIDEN Seiten genutzt:
 *  - Extension-Host (Node): liest `.wmap.png`/`.owm.png`-Bytes und extrahiert die DSL (`pngExtractText`
 *    + `decodeMap`), um sie der Webview als `init` zu schicken.
 *  - Webview (Browser): rastert das SVG zu PNG und bettet die DSL ein (`pngInsertText` + `encodeMap`).
 *
 * Alle Funktionen kommen ohne DOM aus (nur `TextEncoder`/`TextDecoder`/`atob`/`btoa`, in Node ≥18 und
 * im Browser global verfügbar). Die Kodierung ist identisch zur Demo-Webapp (apps/webapp/src/*).
 */

/** PNG-tEXt-Keyword, unter dem die eingebettete Szene abgelegt wird. */
export const EMBED_KEYWORD = 'wardley-map';

/** UTF-8 -> URL-safe Base64 (A-Za-z0-9-_, ohne Padding). */
export function encodeMap(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URL-safe Base64 -> UTF-8 (Gegenstück zu `encodeMap`). */
export function decodeMap(b64: string): string {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// --- PNG-tEXt-Chunk-Helfer ---

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

/** Fügt einen tEXt-Chunk (keyword\0text) vor IEND ein. */
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

/** Liest den Text des ERSTEN tEXt-Chunks mit gegebenem Keyword (oder null, wenn keiner existiert). */
export function pngExtractText(png: Uint8Array, keyword: string): string | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8; // PNG-Signatur überspringen
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

/** Latin-1-Bytes -> String (chunkweise, damit auch große Texte den Call-Stack nicht sprengen). */
function latin1Decode(bytes: Uint8Array): string {
  let out = '';
  // 0x8000 (32 KiB) hält das Spread-Argument-Limit (~64–128k) mit Sicherheitsabstand ein und
  // verhindert „Maximum call stack size exceeded" bei großen eingebetteten Maps.
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
