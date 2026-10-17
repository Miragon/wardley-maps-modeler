import { patchDSL } from '@miragon/wardley-dsl';
import type { WardleyMap } from '@miragon/wardley-schema-model';

/** Runs before the app's own `import.done` listeners (URL sync, chrome), which read the text. */
const BEFORE_APP_LISTENERS = 2000;

export interface SourceTextViewer {
  on<T>(event: string, callback: (event: T) => void, priority?: number): void;
  exportMap(): WardleyMap;
  exportDSL(): string;
}

/**
 * The map as OWM text, written back into the text it was last read from (opened file, pasted or
 * applied text, link, example), so comments, blank lines and statement order survive every edit
 * — in the text panel, the download, the share link and the URL. A map that did not come from
 * text (a JSON file, a new map) is written canonically until text is read again.
 */
export function trackSourceText(viewer: SourceTextViewer): () => string {
  let parsedText: string | undefined;
  let source: { text: string; map: WardleyMap } | undefined;
  viewer.on<{ text: string }>(
    'import.parse.start',
    (event) => {
      parsedText = event.text;
    },
    BEFORE_APP_LISTENERS,
  );
  viewer.on(
    'import.done',
    () => {
      source = parsedText === undefined ? undefined : { text: parsedText, map: viewer.exportMap() };
      parsedText = undefined;
    },
    BEFORE_APP_LISTENERS,
  );
  return () => {
    if (!source) return viewer.exportDSL();
    const map = viewer.exportMap();
    // The modeler keeps the ids of its last import; `previous` pairs them with the re-read text.
    const text = patchDSL(source.text, map, { previous: source.map });
    source = { text, map };
    return text;
  };
}
