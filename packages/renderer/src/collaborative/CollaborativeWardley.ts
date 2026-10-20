import {
  MODELER_API_VERSION,
  type CollaborativeModeler,
  type ElementInfo,
  type ElementsSurface,
  type ImportResult,
  type ModelerMeta,
} from '@miragon/modeler-api';
import { readBackIds } from '@miragon/wardley-dsl';
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
import { isWardleyShape, type WardleyShape } from '../model/di-types.js';

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const WARDLEY_NOTATION = 'wardley';

export interface CollaborativeWardleyOptions {
  /** Appended to the renderer's own modules (e.g. a host's chrome module). */
  additionalModules?: ModuleDeclaration[] | undefined;
  /** See `WardleyViewerOptions.keyboard` (default: the canvas handles undo and redo). */
  keyboard?: { undoRedo?: boolean } | undefined;
  /** See `WardleyViewerOptions.freeRectInsets`. */
  freeRectInsets?: (() => FreeRectInsets) | undefined;
}

/** The contract surface plus the wrapped diagram for host-specific wiring. */
export interface CollaborativeWardleyModeler extends CollaborativeModeler {
  readonly elements: ElementsSurface;
  readonly diagram: Modeler | NavigatedViewer;
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
      ...(options.keyboard ? { keyboard: options.keyboard } : {}),
      ...(options.freeRectInsets ? { freeRectInsets: options.freeRectInsets } : {}),
    }),
    true,
  );
}

/** The read-only mount (`meta.editable: false`): imports, exports and reveals, never edits. */
export function createCollaborativeViewer(
  options: Pick<CollaborativeWardleyOptions, 'additionalModules'> = {},
): CollaborativeWardleyModeler {
  return collaborative(new NavigatedViewer(diagramOptions(options)), false);
}

function diagramOptions(
  options: Pick<CollaborativeWardleyOptions, 'additionalModules'>,
): WardleyViewerOptions {
  return { width: '100%', height: '100%', additionalModules: options.additionalModules ?? [] };
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
  const ids = documentIds(diagram, eventBus);
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

  const elements: ElementsSurface = {
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
      return diagram.exportDSL();
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
    destroy() {
      if (destroyed) return;
      try {
        lastExport = diagram.exportDSL();
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
