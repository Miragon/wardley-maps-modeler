/**
 * File IO for the webapp: open Wardley maps (.wmap / .owm / .json) and download files. Pictures
 * come from the renderer (`saveSVG`, `svgToPng`); sharing an editable map is done via the URL (see
 * share.ts), not via the picture.
 */
import { loadMap, type WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import type { ImportWarning, Modeler } from '@miragon/wardley-renderer';
import { IMAGE_FILE_MESSAGE, MapFileError, notAMapMessage, sniffMapFormat } from './map-file.js';

/** A file read and checked, ready to import: OWM text, or a validated map from JSON. */
export type MapFile =
  | { readonly kind: 'dsl'; readonly text: string }
  | { readonly kind: 'json'; readonly map: WardleyMap };

/**
 * Reads a file as a map without touching the canvas, so a file that is no map leaves the open map
 * and its view alone. The format comes from the content, not the extension. Throws a MapFileError
 * (user-facing message) for pictures and for text that holds no map at all; JSON syntax and schema
 * errors are thrown as they are (the caller logs them).
 */
export async function readMapFile(file: File): Promise<MapFile> {
  const text = await file.text();
  const format = sniffMapFormat(file.name, text);
  if (format === 'image') throw new MapFileError(IMAGE_FILE_MESSAGE);
  if (format === 'json') return { kind: 'json', map: loadMap(JSON.parse(text)) };
  const { map, diagnostics } = parseDSLWithDiagnostics(text);
  if (!map.elements.length && !map.edges.length && diagnostics.length) {
    throw new MapFileError(notAMapMessage(file.name));
  }
  return { kind: 'dsl', text };
}

/** Imports a map read by `readMapFile`. */
export async function importMapFile(mapFile: MapFile, viewer: Modeler): Promise<ImportWarning[]> {
  const { warnings } =
    mapFile.kind === 'json'
      ? await viewer.importMap(mapFile.map)
      : await viewer.importDSL(mapFile.text);
  return warnings;
}

/** Reads a file and imports it into the modeler. */
export async function openFile(file: File, viewer: Modeler): Promise<ImportWarning[]> {
  return importMapFile(await readMapFile(file), viewer);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Some browsers start the download asynchronously; revoking right away can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
