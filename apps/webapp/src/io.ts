/**
 * File IO for the webapp: open Wardley maps (.wmap / .owm / .json) and download files. Pictures
 * come from the renderer (`saveSVG`, `svgToPng`); sharing an editable map is done via the URL (see
 * share.ts), not via the picture.
 */
import { loadMap } from '@miragon/wardley-schema-model';
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import type { ImportWarning, Modeler } from '@miragon/wardley-renderer';
import { IMAGE_FILE_MESSAGE, MapFileError, notAMapMessage, sniffMapFormat } from './map-file.js';

/**
 * Reads a file and imports it into the modeler. The format comes from the content, not the
 * extension. Throws a MapFileError (user-facing message) for pictures and for text that holds no
 * map at all; JSON syntax and schema errors are thrown as they are (the caller logs them).
 */
export async function openFile(file: File, viewer: Modeler): Promise<ImportWarning[]> {
  const text = await file.text();
  const format = sniffMapFormat(file.name, text);
  if (format === 'image') throw new MapFileError(IMAGE_FILE_MESSAGE);
  if (format === 'json') {
    return (await viewer.importMap(loadMap(JSON.parse(text)))).warnings;
  }
  const { map, diagnostics } = parseDSLWithDiagnostics(text);
  if (!map.elements.length && !map.edges.length && diagnostics.length) {
    throw new MapFileError(notAMapMessage(file.name));
  }
  return (await viewer.importDSL(text)).warnings;
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
