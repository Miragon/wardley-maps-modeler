/**
 * File IO for the webapp: open Wardley maps (.wmap / .owm / .json) and export them as pictures
 * (SVG / PNG). Sharing an editable map is done via the URL (see share.ts), not via the image.
 */
import { loadMap } from '@miragon/wardley-schema-model';
import { COLORS, type ImportWarning, type Modeler } from '@miragon/wardley-renderer';

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

/** Reads a file and imports it into the modeler. Throws with a descriptive message on errors. */
export async function openFile(file: File, viewer: Modeler): Promise<ImportWarning[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.png') || name.endsWith('.svg')) {
    throw new Error('Images cannot be opened as maps — open a .wmap, .owm or .json file.');
  }
  if (name.endsWith('.json')) {
    return (await viewer.importMap(loadMap(JSON.parse(await file.text())))).warnings;
  }
  // .wmap / .owm / .txt / unknown -> treat as OWM-DSL
  return (await viewer.importDSL(await file.text())).warnings;
}

// ---------------------------------------------------------------------------
// PNG export (rasterize)
// ---------------------------------------------------------------------------

export interface PngOptions {
  /** Rasterization factor (default 2x). */
  readonly scale?: number;
  /** Export without a background fill (for slides/docs). */
  readonly transparent?: boolean;
}

/** Rasterizes the SVG to a PNG picture. */
export async function svgToPng(svg: string, options: PngOptions = {}): Promise<Blob> {
  const { width, height } = svgSize(svg);
  const png = await rasterize(svg, width, height, options.scale ?? 2, options.transparent ?? false);
  return new Blob([png as BlobPart], { type: 'image/png' });
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
  transparent: boolean,
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
    if (!transparent) {
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG generation failed.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
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
