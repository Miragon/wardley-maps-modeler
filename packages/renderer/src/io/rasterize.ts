import { COLORS } from '../draw/styles.js';

export interface SvgToPngOptions {
  /**
   * Pixel density factor relative to the SVG's own size (default 2). Lowered automatically where
   * the PNG would exceed the browser's canvas size limits.
   */
  readonly scale?: number;
  /** Leave the background transparent instead of filling it with the paper colour (slides, docs). */
  readonly transparent?: boolean;
}

/** Used when the SVG declares neither a usable width/height nor a viewBox. */
const FALLBACK_SIZE = { width: 1000, height: 700 } as const;

/**
 * Stays below the canvas limits of current desktop browsers; beyond them `toBlob` yields nothing
 * and the export fails outright (e.g. a 5000 x 5000 plot at scale 4).
 */
const MAX_CANVAS_SIDE = 32_767;
const MAX_CANVAS_AREA = 2 ** 27;

/**
 * Rasterizes a standalone SVG (e.g. from `saveSVG()`) into a PNG picture. Browser-only: needs
 * `Image`, `<canvas>` and object URLs. The PNG carries no embedded map source.
 */
export async function svgToPng(svg: string, options: SvgToPngOptions = {}): Promise<Blob> {
  const scale = options.scale ?? 2;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`PNG scale must be a positive number, got ${scale}.`);
  }
  const { width, height } = svgSize(svg);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.width = width;
    image.height = height;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not render the SVG.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    const pixels = rasterSize(width, height, scale);
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context not available.');
    if (!options.transparent) {
      context.fillStyle = COLORS.paper;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG generation failed.');
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Pixel size of the PNG: the SVG size times `scale`, reduced proportionally where it would exceed
 * the browser's canvas limits, so a huge map still exports, just at a lower density.
 */
export function rasterSize(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  const fittingScale = Math.min(
    scale,
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
    Math.sqrt(MAX_CANVAS_AREA / (width * height)),
  );
  return {
    width: Math.max(1, Math.min(MAX_CANVAS_SIDE, Math.round(width * fittingScale))),
    height: Math.max(1, Math.min(MAX_CANVAS_SIDE, Math.round(height * fittingScale))),
  };
}

/** Blob -> Base64 without the data-URL prefix, e.g. to post an export to a VS Code extension host. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the export blob.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Reads the size from the root <svg> element only: a regex over the text would also match the
 * width of the first nested rect when the root has a relative size such as `100%`.
 */
function svgSize(svg: string): { width: number; height: number } {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const width = absoluteLength(root.getAttribute('width'));
  const height = absoluteLength(root.getAttribute('height'));
  if (width && height) return { width, height };

  const viewBox = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [, , viewBoxWidth, viewBoxHeight] = viewBox;
  if (
    viewBox.length === 4 &&
    viewBoxWidth !== undefined &&
    viewBoxHeight !== undefined &&
    viewBoxWidth > 0 &&
    viewBoxHeight > 0
  ) {
    return { width: width ?? viewBoxWidth, height: height ?? viewBoxHeight };
  }
  return { width: width ?? FALLBACK_SIZE.width, height: height ?? FALLBACK_SIZE.height };
}

function absoluteLength(value: string | null): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/.exec(value ?? '');
  const length = match ? Number(match[1]) : NaN;
  return length > 0 ? length : undefined;
}
