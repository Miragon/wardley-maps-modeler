/**
 * Pure helpers around map files: download names, format sniffing and user-facing import messages.
 * DOM-free so they are unit-testable in Node.
 */

export const FALLBACK_FILE_BASE = 'wardley-map';
const MAX_FILE_BASE_LENGTH = 60;

/** Titles the app or the model assign on their own; they say nothing about the map. */
const DEFAULT_TITLES = new Set(['untitled map', 'new map']);

export function isDefaultTitle(title: string | undefined): boolean {
  return !title?.trim() || DEFAULT_TITLES.has(title.trim().toLowerCase());
}

/** "Tea Shop – Ü-Bahn" -> "tea-shop-u-bahn": ASCII, lowercase, dash-separated, capped. */
export function slugify(text: string): string {
  return text
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_FILE_BASE_LENGTH)
    .replace(/^-+|-+$/g, '');
}

/** File name without extension for downloads of the map with this title. */
export function fileBaseName(title: string | undefined): string {
  if (isDefaultTitle(title)) return FALLBACK_FILE_BASE;
  return slugify(title ?? '') || FALLBACK_FILE_BASE;
}

export type DownloadKind = 'wmap' | 'json' | 'svg' | 'png' | 'png-transparent';

export function downloadFileName(title: string | undefined, kind: DownloadKind): string {
  const base = fileBaseName(title);
  switch (kind) {
    case 'png-transparent':
      return `${base}-transparent@4x.png`;
    default:
      return `${base}.${kind}`;
  }
}

export type MapFormat = 'json' | 'dsl' | 'image';

/**
 * Decides how to read a dropped or opened file. The content wins over the extension: a DSL file
 * saved as .json (or JSON saved as .wmap) still opens. Pictures are recognised to explain that the
 * map source is not embedded in them.
 */
export function sniffMapFormat(fileName: string, text: string): MapFormat {
  const name = fileName.toLowerCase();
  const start = text.trimStart();
  if (name.endsWith('.png') || name.endsWith('.svg') || start.startsWith('\u0089PNG')) {
    return 'image';
  }
  if (/^<(\?xml|svg)\b/i.test(start)) return 'image';
  return start.startsWith('{') ? 'json' : 'dsl';
}

export class MapFileError extends Error {
  override readonly name = 'MapFileError';
}

export const IMAGE_FILE_MESSAGE =
  'Pictures don’t contain the map source. Open a .wmap, .owm or .json file instead.';

/** "Could not open “x.json”. Check that it contains a Wardley map (.wmap, .owm or .json)." */
export function notAMapMessage(fileName?: string): string {
  const subject = fileName ? `“${fileName}”` : 'the file';
  return `Could not open ${subject}. Check that it contains a Wardley map (.wmap, .owm or .json).`;
}

/**
 * Turns whatever an import threw into one sentence for a toast. Raw parser and schema dumps (JSON
 * syntax errors, Zod issue lists) never reach the user; they go to the console instead.
 */
export function importErrorMessage(error: unknown, fileName?: string): string {
  if (error instanceof MapFileError) return error.message;
  return notAMapMessage(fileName);
}

export interface WarningLike {
  readonly message: string;
  readonly line?: number;
  readonly source?: string;
}

export interface WarningRow {
  readonly line?: number;
  readonly message: string;
  readonly source?: string;
}

/**
 * Splits an import warning into line, message and source for a list row. DSL findings arrive
 * pre-formatted as `Line N: message — "source"`; the structured fields let us undo that.
 */
export function describeWarning(warning: WarningLike): WarningRow {
  if (warning.line === undefined) return { message: warning.message };
  const message = warning.message
    .replace(/^Line \d+:\s*/, '')
    .replace(/\s+—\s+"[\s\S]*"$/, '')
    .trim();
  return {
    line: warning.line,
    message: message || warning.message,
    ...(warning.source !== undefined ? { source: warning.source } : {}),
  };
}

/**
 * The 1-based line holding `source` in `text`, if any. The map text is regenerated on export (lines
 * that could not be read move to the end), so a warning's line in the imported text may point
 * elsewhere in it.
 */
export function lineOfSource(text: string, source: string | undefined): number | undefined {
  const wanted = source?.trim();
  if (!wanted) return undefined;
  const index = text.split('\n').findIndex((line) => line.trim() === wanted);
  return index === -1 ? undefined : index + 1;
}
