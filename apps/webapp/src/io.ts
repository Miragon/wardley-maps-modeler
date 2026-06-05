/**
 * Datei-IO der Webapp: Wardley-Maps oeffnen (.wmap/.json/.svg/.png) und exportieren (SVG/PNG)
 * — mit in die Bild-Datei EINGEBETTETER Scene (DSL), sodass exportierte PNG/SVG wieder per
 * Drag&Drop geoeffnet werden koennen (Idee aus Excalidraw).
 */
import { loadMap } from '@wardley/schema-model';
import type { Modeler } from '@wardley/renderer';
import { encodeMap, decodeMap } from './share.js';

/** PNG-tEXt-Keyword / SVG-Attribut fuer die eingebettete Scene. */
const EMBED_KEYWORD = 'wardley-map';
const SVG_ATTR = 'data-wardley-map';

// ---------------------------------------------------------------------------
// Oeffnen
// ---------------------------------------------------------------------------

/** Liest eine Datei und importiert sie in den Modeler. Wirft mit sprechender Meldung bei Fehlern. */
export async function openFile(file: File, viewer: Modeler): Promise<void> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.png')) {
    const embedded = pngExtractText(new Uint8Array(await file.arrayBuffer()), EMBED_KEYWORD);
    if (!embedded) throw new Error('This PNG does not contain an embedded Wardley map.');
    await viewer.importDSL(decodeMap(embedded));
  } else if (name.endsWith('.svg')) {
    const dsl = extractSvgDsl(await file.text());
    if (!dsl) throw new Error('This SVG does not contain an embedded Wardley map.');
    await viewer.importDSL(dsl);
  } else if (name.endsWith('.json')) {
    await viewer.importMap(loadMap(JSON.parse(await file.text())));
  } else {
    // .wmap / .owm / .txt / unbekannt -> als OWM-DSL behandeln
    await viewer.importDSL(await file.text());
  }
}

// ---------------------------------------------------------------------------
// SVG-Export (mit eingebetteter DSL)
// ---------------------------------------------------------------------------

/** Bettet die DSL als Attribut in das Wurzel-<svg> ein. */
export function embedSvg(svg: string, dsl: string): string {
  return svg.replace(/<svg\b/, `<svg ${SVG_ATTR}="${encodeMap(dsl)}"`);
}

function extractSvgDsl(svg: string): string | null {
  const m = new RegExp(`${SVG_ATTR}="([^"]*)"`).exec(svg);
  return m && m[1] ? decodeMap(m[1]) : null;
}

// ---------------------------------------------------------------------------
// PNG-Export (Rasterung + eingebettete DSL via tEXt-Chunk)
// ---------------------------------------------------------------------------

/** Rastert das SVG zu PNG (2x) und bettet die DSL als tEXt-Chunk ein. */
export async function svgToEmbeddedPng(svg: string, dsl: string, scale = 2): Promise<Blob> {
  const { width, height } = svgSize(svg);
  const png = await rasterize(svg, width, height, scale);
  const withScene = pngInsertText(png, EMBED_KEYWORD, encodeMap(dsl));
  return new Blob([withScene as BlobPart], { type: 'image/png' });
}

function svgSize(svg: string): { width: number; height: number } {
  const w = /width="(\d+(?:\.\d+)?)"/.exec(svg);
  const h = /height="(\d+(?:\.\d+)?)"/.exec(svg);
  return { width: w ? Number(w[1]) : 1000, height: h ? Number(h[1]) : 700 };
}

async function rasterize(
  svg: string,
  width: number,
  height: number,
  scale: number,
): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.width = width;
    img.height = height;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the SVG.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available.');
    ctx.fillStyle = '#fbfaf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG generation failed.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

// --- PNG-Chunk-Helfer (tEXt) ---

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

/** Fuegt einen tEXt-Chunk (keyword\0text) vor IEND ein. */
function pngInsertText(png: Uint8Array, keyword: string, text: string): Uint8Array {
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

/** Liest den Text eines tEXt-Chunks mit gegebenem Keyword (oder null). */
function pngExtractText(png: Uint8Array, keyword: string): string | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8; // PNG-Signatur
  while (off + 8 <= png.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!);
    const dataStart = off + 8;
    if (type === 'tEXt') {
      const data = png.subarray(dataStart, dataStart + len);
      const nul = data.indexOf(0);
      if (nul >= 0) {
        const key = String.fromCharCode(...data.subarray(0, nul));
        if (key === keyword) return String.fromCharCode(...data.subarray(nul + 1));
      }
    }
    if (type === 'IEND') break;
    off = dataStart + len + 4;
  }
  return null;
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

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
