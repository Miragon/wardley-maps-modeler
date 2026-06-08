/**
 * Bild-Export der Webview: SVG/PNG mit in die Datei EINGEBETTETER Szene (OWM-DSL), sodass
 * exportierte Bilder später wieder als Wardley-Map geöffnet werden können (Idee aus Excalidraw).
 * Identische Kodierung wie die Demo-Webapp (apps/webapp/src/io.ts + share.ts).
 *
 * Die reinen Byte-/Encoding-Helfer liegen DOM-frei in ../png.ts (auch vom Extension-Host genutzt).
 * Hier verbleibt nur das, was den Browser braucht (Rasterung via Canvas, Blob/FileReader).
 */

import { EMBED_KEYWORD, encodeMap, pngInsertText } from '../png.js';

const SVG_ATTR = 'data-wardley-map';

/** Bettet die DSL als Attribut ins Wurzel-<svg> ein. */
export function embedSvg(svg: string, dsl: string): string {
  return svg.replace(/<svg\b/, `<svg ${SVG_ATTR}="${encodeMap(dsl)}"`);
}

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

/** Blob -> Base64 (ohne Data-URL-Prefix) für den Transport an den Host. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the export blob.'));
    reader.readAsDataURL(blob);
  });
}
