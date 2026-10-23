import {
  MODELER_API_VERSION,
  type CollaborativeModeler,
  type CollaborativeModelerOptions,
  type ElementBounds,
  type ElementInfo,
  type ElementsSurface,
  type ImportResult,
  type ModelerMeta,
} from '@miragon/modeler-api';
import { readBackIds, serializeDSL } from '@miragon/wardley-dsl';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element } from 'diagram-js/lib/model/Types';
import { Modeler } from '../Modeler.js';
import { NavigatedViewer } from '../NavigatedViewer.js';
import type { WardleyViewerOptions } from '../WardleyBaseViewer.js';
import { restoreEditorState, setAsideEditorState, type EditorState } from '../editor-state.js';
import type { FreeRectInsets } from '../free-rect/index.js';
import type { LivePreview } from '../live-preview/index.js';
import { isWardleyShape, type WardleyShape } from '../model/di-types.js';
import type { PanConstraint } from '../pan-constraint/index.js';

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const WARDLEY_NOTATION = 'wardley';

/**
 * The contract's factory options (`freeArea`, `fitOnImport`, `undoRedoKeys`, see
 * `WardleyViewerOptions`) plus the renderer's own. The viewer ignores `undoRedoKeys`.
 */
export interface CollaborativeWardleyOptions extends CollaborativeModelerOptions {
  /** Appended to the renderer's own modules (e.g. a host's chrome module). */
  additionalModules?: ModuleDeclaration[] | undefined;
  /** @deprecated Since 0.9, for one minor release: use `undoRedoKeys`, which wins over it. */
  keyboard?: { undoRedo?: boolean } | undefined;
  /** @deprecated Since 0.9, for one minor release: use `freeArea: { insets }`, which wins over it. */
  freeRectInsets?: (() => FreeRectInsets) | undefined;
}

/** The contract's element surface, with the optional `bounds` of contract 1.2 always present. */
export interface WardleyElementsSurface extends ElementsSurface {
  bounds(id: string): ElementBounds | undefined;
}

/**
 * The contract surface, with the optional `contentBounds` of contract 1.3 always present, plus the
 * wrapped diagram for host-specific wiring.
 */
export interface CollaborativeWardleyModeler extends CollaborativeModeler {
  readonly elements: WardleyElementsSurface;
  readonly diagram: Modeler | NavigatedViewer;
  contentBounds(): ElementBounds | undefined;
}

interface ViewState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The named elements: components, anchors, pipelines, submaps and accelerators. Their names are
 * unique on a map, so the id the document derives from a name survives edits to other elements.
 * Notes, annotations, regions and drawings may repeat their text, number or kind, and the parser
 * tells repeats apart by line order, so their ids would move to another element.
 */
const ADDRESSABLE_TYPES: ReadonlySet<string> = new Set([
  'component',
  'anchor',
  'pipeline',
  'submap',
  'accelerator',
]);

function isAddressable(element: unknown): element is WardleyShape {
  return isWardleyShape(element) && ADDRESSABLE_TYPES.has(element.wardleyType);
}

/** The editing mount (`meta.editable: true`) of the collaborative-modeler contract. */
export function createCollaborativeModeler(
  options: CollaborativeWardleyOptions = {},
): CollaborativeWardleyModeler {
  return collaborative(
    new Modeler({
      ...diagramOptions(options),
      undoRedoKeys: options.undoRedoKeys,
      keyboard: options.keyboard,
    }),
    true,
  );
}

/** The read-only mount (`meta.editable: false`): imports, exports and reveals, never edits. */
export function createCollaborativeViewer(
  options: CollaborativeWardleyOptions = {},
): CollaborativeWardleyModeler {
  return collaborative(new NavigatedViewer(diagramOptions(options)), false);
}

function diagramOptions(options: CollaborativeWardleyOptions): WardleyViewerOptions {
  return {
    width: '100%',
    height: '100%',
    additionalModules: options.additionalModules ?? [],
    freeArea: options.freeArea,
    freeRectInsets: options.freeRectInsets,
    fitOnImport: options.fitOnImport,
  };
}

/**
 * The document ids of the canvas's elements and back, read once per content change: an element
 * created or renamed on the canvas keeps its canvas id until the text is read again.
 */
function documentIds(diagram: Modeler | NavigatedViewer, eventBus: EventBus) {
  let byCanvasId: Map<string, string> | undefined;
  let byDocumentId: Map<string, string> | undefined;
  eventBus.on(
    ['elements.changed', 'import.done', 'diagram.clear', 'commandStack.changed'],
    () => (byCanvasId = byDocumentId = undefined),
  );
  const read = () => {
    if (!byCanvasId) {
      try {
        byCanvasId = readBackIds(diagram.exportMap());
      } catch {
        byCanvasId = new Map();
      }
      byDocumentId = new Map([...byCanvasId].map(([canvasId, id]) => [id, canvasId]));
    }
    return { byCanvasId, byDocumentId: byDocumentId! };
  };
  return {
    of: (canvasId: string) => read().byCanvasId.get(canvasId) ?? canvasId,
    canvasIdOf: (documentId: string) => read().byDocumentId.get(documentId) ?? documentId,
  };
}

function collaborative(
  diagram: Modeler | NavigatedViewer,
  editable: boolean,
): CollaborativeWardleyModeler {
  const eventBus = diagram.get<EventBus>('eventBus');
  const canvas = diagram.get<Canvas>('canvas');
  const elementRegistry = diagram.get<ElementRegistry>('elementRegistry');
  const selection = diagram.get<Selection>('selection');
  const panConstraint = diagram.get<PanConstraint>('panConstraint');
  const ids = documentIds(diagram, eventBus);
  const livePreview = editable ? diagram.get<LivePreview>('wardleyLivePreview') : undefined;
  const contentListeners = new Set<() => void>();
  let importsRunning = 0;
  let imported = false;
  let destroyed = false;
  let lastExport = '';

  const meta: ModelerMeta = {
    notation: WARDLEY_NOTATION,
    apiVersion: MODELER_API_VERSION,
    editable,
  };

  // The command stack is the one channel of every user-visible change, config edits included;
  // an import clears it, which is housekeeping, not a change (L1, L3).
  if (editable) {
    eventBus.on('commandStack.changed', () => {
      if (importsRunning > 0) return;
      for (const listener of [...contentListeners]) listener();
    });
  }

  const documentIdsOf = (elements: readonly unknown[]): string[] =>
    elements.filter(isAddressable).map((element) => ids.of(element.id));

  const elementInfo = (element: WardleyShape): ElementInfo => {
    const id = ids.of(element.id);
    return element.wardleyLabel ? { id, name: element.wardleyLabel } : { id };
  };

  /** The element `list()` reports under `id`, read from the live canvas. */
  const listedElement = (id: string): WardleyShape | undefined => {
    if (destroyed) return undefined;
    const element: unknown = elementRegistry.get(ids.canvasIdOf(id));
    return isAddressable(element) && ids.of(element.id) === id ? element : undefined;
  };

  const elements: WardleyElementsSurface = {
    list: () =>
      destroyed
        ? []
        : (elementRegistry.getAll() as unknown[]).filter(isAddressable).map(elementInfo),
    reveal(id) {
      if (destroyed) return false;
      const element = elementRegistry.get(ids.canvasIdOf(id));
      if (!isAddressable(element)) return false;
      selection.select(element as unknown as Element);
      canvas.scrollToElement(element as unknown as Element);
      return true;
    },
    selection: () => (destroyed ? [] : documentIdsOf(selection.get())),
    onSelection(callback) {
      const listener = (event: unknown) =>
        callback(documentIdsOf((event as { newSelection?: unknown[] }).newSelection ?? []));
      eventBus.on('selection.changed', listener);
      return () => eventBus.off('selection.changed', listener);
    },
    bounds(id) {
      const element = listedElement(id);
      if (!element) return undefined;
      const { x, y, width, height } = element;
      return { x, y, width, height };
    },
  };

  // Never a live preview: a host saves the export at any moment, also during a plot-resize drag.
  const committedText = (): string => {
    const committed = livePreview?.committedMap();
    return committed ? serializeDSL(committed) : diagram.exportDSL();
  };

  async function importText(text: string): Promise<ImportResult> {
    if (destroyed) throw new Error('The modeler was destroyed.');
    importsRunning += 1;
    // An open label editor neither commits during the import nor loses what was typed (L1): it
    // is taken down and reopened on the element with the same id.
    const editorState: EditorState | undefined =
      editable && imported ? setAsideEditorState(diagram as Modeler) : undefined;
    try {
      const { warnings } = await diagram.importDSL(text);
      imported = true;
      if (editorState) restoreEditorState(diagram as Modeler, editorState);
      return { warnings: warnings.map((warning) => warning.message) };
    } catch (error) {
      if (editorState)
        restoreEditorState(diagram as Modeler, editorState, { importRejected: true });
      throw error;
    } finally {
      importsRunning -= 1;
    }
  }

  return {
    meta,
    elements,
    diagram,
    attachTo(host) {
      diagram.attachTo(host as HTMLElement);
    },
    importText,
    exportText() {
      // Asking a destroyed diagram would build a new one on the detached container.
      if (destroyed) return lastExport;
      return committedText();
    },
    onContentChanged(callback) {
      if (!editable) return () => undefined;
      contentListeners.add(callback);
      return () => contentListeners.delete(callback);
    },
    getViewState(): ViewState | undefined {
      if (destroyed) return undefined;
      try {
        const { x, y, width, height } = canvas.viewbox();
        const state = { x, y, width, height };
        return isViewState(state) ? state : undefined;
      } catch {
        return undefined;
      }
    },
    setViewState(state) {
      if (destroyed || !isViewState(state)) return;
      canvas.viewbox({ x: state.x, y: state.y, width: state.width, height: state.height });
    },
    // Every map draws its plot, also one without elements, so there is always a box to fit (before
    // the first import the default plot's). A host fits to the box the pan constraint keeps in view.
    contentBounds() {
      if (destroyed) return undefined;
      const { x, y, width, height } = panConstraint.contentBounds();
      return { x, y, width, height };
    },
    destroy() {
      if (destroyed) return;
      try {
        lastExport = committedText();
      } catch {
        lastExport = '';
      }
      destroyed = true;
      contentListeners.clear();
      diagram.destroy();
    },
  };
}

function isViewState(state: unknown): state is ViewState {
  if (typeof state !== 'object' || state === null) return false;
  const { x, y, width, height } = state as Record<string, unknown>;
  return (
    isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    width > 0 &&
    height > 0
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
