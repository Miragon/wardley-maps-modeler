/**
 * Image export for the webview: SVG/PNG with the scene (OWM-DSL) EMBEDDED in the file, so exported
 * images can later be reopened as a Wardley map (idea from Excalidraw). Identical encoding to the
 * demo webapp (apps/webapp/src/io.ts + share.ts).
 *
 * The pure byte/encoding helpers live DOM-free in ../png.ts (also used by the extension host).
 * Only what the browser needs remains here (rasterization via canvas, Blob/FileReader).
 */

import { COLORS } from '@miragon/wardley-renderer';
import { EMBED_KEYWORD, encodeMap, pngInsertText } from '../png.js';

const SVG_ATTR = 'data-wardley-map';

export function embedSvg(svg: string, dsl: string): string {
  return svg.replace(/<svg\b/, `<svg ${SVG_ATTR}="${encodeMap(dsl)}"`);
}

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
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG generation failed.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Blob -> Base64 (without the data-URL prefix) for transport to the host. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the export blob.'));
    reader.readAsDataURL(blob);
  });
}
