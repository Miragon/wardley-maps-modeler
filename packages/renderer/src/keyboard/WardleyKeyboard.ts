import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Connect from 'diagram-js/lib/features/connect/Connect';
import type Create from 'diagram-js/lib/features/create/Create';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import type LassoTool from 'diagram-js/lib/features/lasso-tool/LassoTool';
import type Mouse from 'diagram-js/lib/features/mouse/Mouse';
import type PopupMenu from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type Rules from 'diagram-js/lib/features/rules/Rules';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import type { Injector } from 'didi';
import type WardleyCopyPaste from '../modeling/WardleyCopyPaste.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type WardleyDrawTool from '../draw-tool/WardleyDrawTool.js';
import type WardleyLabelEditing from '../label-editing/WardleyLabelEditing.js';
import type { FreeRect } from '../free-rect/index.js';
import { isReadOnly } from '../read-only/index.js';
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyShape,
  type WardleyShapeType,
} from '../model/di-types.js';

/** Diagram config `wardleyKeyboard` (Modeler option `keyboard`). */
export interface WardleyKeyboardConfig {
  /**
   * Handle Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y on the canvas (default true). Hosts that own
   * undo themselves (VS Code custom editors) set this to false and receive the keys untouched.
   */
  undoRedo?: boolean;
}

/** Arrow-key nudge in diagram px (Shift = coarse). */
const NUDGE_STEP = 2;
const NUDGE_STEP_COARSE = 10;

const ARROW_DELTAS: Record<string, { x: number; y: number }> = {
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
};

const QUICK_CREATE: Record<string, { type: WardleyShapeType; label: string }> = {
  c: { type: 'component', label: 'Component' },
  u: { type: 'anchor', label: 'User' },
  n: { type: 'note', label: 'Note' },
  p: { type: 'pipeline', label: 'Pipeline' },
};

/** Keyboard-created shapes stay this far inside the plot edge. */
const PLOT_INSET = 40;
/**
 * Repeated keyboard creates step downwards so they do not stack on one spot; labels sit to the
 * right of nodes, so a vertical step keeps every name readable. At the plot bottom the next
 * column starts, leaving room for the labels.
 */
const STACK_STEP = 56;
const STACK_COLUMN_STEP = 160;
const STACK_CLEARANCE = { x: 48, y: 40 };
const STACK_ATTEMPTS = 40;

interface PlotBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Focus inside these never drives canvas shortcuts: they own their keys (typing, select
 * type-ahead, menu/dialog navigation, colour swatches).
 */
const OWN_KEYS_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  'dialog',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[role="menu"]',
  '.wardley-color-picker',
].join(', ');

/** Single-key tools (create, lasso, connect): a plain button does nothing with letter keys. */
const BUTTON_SAFE_TOOL_KEYS = new Set([...Object.keys(QUICK_CREATE), 'l', 'a']);

/**
 * Keys a focused host button has no use for, so they still reach the canvas: undo/redo and the
 * single-key tools. Delete, the arrows, Enter, Space and Escape stay with the button.
 */
function isButtonSafeKey(event: KeyboardEvent): boolean {
  if (event.altKey) return false;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) return key === 'z' || key === 'y';
  return BUTTON_SAFE_TOOL_KEYS.has(key);
}

/**
 * Decides whether a keydown belongs to the host page rather than the canvas. Canvas shortcuts
 * only run when focus is on the canvas, the palette, or nowhere in particular (body) — so a
 * focused host button or select never deletes or nudges map elements. A focused plain button
 * (zoom, share, menu) still lets undo/redo and the single-key tools through, unless the host's
 * chrome owns every key aimed at it (`canvasTargetsOnly`, the Miragon modeler shell: its zoom
 * panel's buttons do not stop the keys they leave alone).
 */
export function shouldIgnoreKeyEvent(
  event: KeyboardEvent,
  canvasContainer: HTMLElement,
  canvasTargetsOnly = false,
): boolean {
  if (event.defaultPrevented) return true;
  const target = event.target;
  if (!(target instanceof globalThis.Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target.closest(OWN_KEYS_SELECTOR)) return true;
  if (target === document.body || target === document.documentElement) return false;
  if (canvasContainer.contains(target)) return false;
  if (canvasTargetsOnly) return true;
  if (target.closest('.djs-palette')) return false;
  if (target.closest('button, [role="button"]') && isButtonSafeKey(event)) return false;
  return true;
}

/**
 * Keyboard binding: undo/redo, delete, copy/paste/duplicate, arrow-key nudge, Escape (deselect),
 * Cmd/Ctrl+A (select all), the single-key tools C (component), U (user), N (note), P (pipeline),
 * L (lasso) and A (connect from the selected node). Deliberately a DOM listener (no diagram-js
 * keyboard-service binding needed).
 */
export default class WardleyKeyboard {
  static $inject = [
    'canvas',
    'commandStack',
    'selection',
    'modeling',
    'wardleyCopyPaste',
    'wardleyElementFactory',
    'create',
    'mouse',
    'lassoTool',
    'eventBus',
    'elementRegistry',
    'injector',
    'config.wardleyKeyboard',
  ];

  private pointerOverCanvas = false;
  private readonly labelEditing: WardleyLabelEditing | null;
  private readonly grid: EvolutionGrid | null;
  private readonly freeRect: FreeRect | null;

  constructor(
    private readonly canvas: Canvas,
    commandStack: CommandStack,
    private readonly selection: Selection,
    private readonly modeling: Modeling,
    copyPaste: WardleyCopyPaste,
    private readonly factory: WardleyElementFactory,
    private readonly create: Create,
    private readonly mouse: Mouse,
    lassoTool: LassoTool,
    eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    injector: Injector,
    config: WardleyKeyboardConfig | undefined,
  ) {
    const container = canvas.getContainer();
    const undoRedoEnabled = config?.undoRedo !== false;
    const dragging = injector.get<Dragging | null>('dragging', false);
    const connect = injector.get<Connect | null>('connect', false);
    const rules = injector.get<Rules | null>('rules', false);
    const popupMenu = injector.get<PopupMenu | null>('popupMenu', false);
    const drawTool = injector.get<WardleyDrawTool | null>('wardleyDrawTool', false);
    this.labelEditing =
      injector.get<WardleyLabelEditing | null>('wardleyLabelEditing', false) ?? null;
    this.grid = injector.get<EvolutionGrid | null>('evolutionGrid', false) ?? null;
    this.freeRect = injector.get<FreeRect | null>('wardleyFreeRect', false) ?? null;
    const canvasTargetsOnly = !!injector.get('modelerShell', false);

    // getLastMoveEvent() never returns null (it fabricates an event at 0,0), so whether the
    // pointer really is over the canvas has to be tracked here.
    const onPointerMove = () => (this.pointerOverCanvas = true);
    const onPointerLeave = () => (this.pointerOverCanvas = false);
    container.addEventListener('mousemove', onPointerMove);
    container.addEventListener('mouseleave', onPointerLeave);

    // Escape is consumed by drags, the draw tool and popups, which react in the capture phase or
    // on keyup — their state is snapshotted before any of them runs.
    let escapeOwnedByOverlay = false;
    const onKeydownCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      escapeOwnedByOverlay =
        !!dragging?.context() ||
        !!drawTool?.isActive() ||
        !!popupMenu?.isOpen() ||
        !!container.querySelector('.wardley-color-picker');
    };

    const deleteSelection = (e: KeyboardEvent) => {
      const selected = selection.get() as Element[];
      if (!selected.length) return;
      e.preventDefault();
      modeling.removeElements(selected);
    };

    // The element clipboard lives in memory, so the browser cannot tell whether it or the system
    // clipboard is newer. After the page lost focus or saw a text copy, the system clipboard may
    // hold something newer (e.g. map text to import): let the browser's paste event reach the host
    // first and only paste the copied elements when nobody consumed it.
    let internalClipboardIsNewest = false;
    let deferredPaste: ReturnType<typeof setTimeout> | undefined;
    const markSystemClipboardNewer = () => (internalClipboardIsNewest = false);
    const pasteFromInternalClipboard = (e: KeyboardEvent) => {
      if (internalClipboardIsNewest) {
        if (copyPaste.paste()) e.preventDefault();
        return;
      }
      clearTimeout(deferredPaste);
      deferredPaste = setTimeout(() => {
        deferredPaste = undefined;
        copyPaste.paste();
      }, 0);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (deferredPaste === undefined || !e.defaultPrevented) return;
      clearTimeout(deferredPaste);
      deferredPaste = undefined;
    };

    // A locked canvas (an invalid file in an IDE) keeps selection, copy and the lasso.
    const locked = () => isReadOnly(injector);
    const onModifierShortcut = (e: KeyboardEvent, key: string) => {
      if (locked() && !['a', 'c'].includes(key)) return;
      if (key === 'z' || key === 'y') {
        if (!undoRedoEnabled) return;
        e.preventDefault();
        if (key === 'z' && !e.shiftKey) commandStack.undo();
        else commandStack.redo();
      } else if (key === 'a') {
        e.preventDefault();
        selection.select(
          elementRegistry.filter((el) => isWardleyShape(el) || isWardleyConnection(el)),
        );
      } else if (key === 'c') {
        if (copyPaste.copy()) {
          e.preventDefault();
          internalClipboardIsNewest = true;
        }
      } else if (key === 'v') {
        pasteFromInternalClipboard(e);
      } else if (key === 'd') {
        e.preventDefault();
        if (copyPaste.duplicate()) internalClipboardIsNewest = true;
      } else if (key === 'delete' || key === 'backspace') {
        deleteSelection(e);
      }
    };

    const onPlainKey = (e: KeyboardEvent, key: string) => {
      const toolKey = !e.altKey;
      if (locked() && key !== 'escape' && key !== 'l') return;
      if (key === 'escape') {
        if (!escapeOwnedByOverlay && selection.get().length) selection.select(null);
      } else if (key === 'delete' || key === 'backspace') {
        deleteSelection(e);
      } else if (toolKey && key in QUICK_CREATE) {
        e.preventDefault();
        const { type, label } = QUICK_CREATE[key]!;
        this.quickCreate(type, label);
      } else if (toolKey && key === 'a') {
        const source = this.singleSelectedShape();
        if (!source || !connect || !rules?.allowed('connection.start', { source })) return;
        e.preventDefault();
        const center = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
        connect.start(this.pointerEventOr(center), source as unknown as Element, center, true);
      } else if (toolKey && key === 'l') {
        e.preventDefault();
        lassoTool.activateSelection(mouse.getLastMoveEvent(), true);
      } else if (key in ARROW_DELTAS) {
        const selected = selection.get() as Element[];
        if (!selected.length) return;
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_STEP_COARSE : NUDGE_STEP;
        const delta = ARROW_DELTAS[key]!;
        modeling.moveElements(selected, { x: delta.x * step, y: delta.y * step });
      }
    };

    // Bound on the DOCUMENT (not the canvas container): single-key tools must work without the
    // canvas having focus first — same trade-off bpmn-js makes for its keyboard.
    const onKeydown = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyEvent(e, container, canvasTargetsOnly)) return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) onModifierShortcut(e, key);
      else onPlainKey(e, key);
    };

    window.addEventListener('keydown', onKeydownCapture, true);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('blur', markSystemClipboardNewer);
    document.addEventListener('copy', markSystemClipboardNewer);
    document.addEventListener('cut', markSystemClipboardNewer);
    window.addEventListener('paste', onPaste);
    eventBus.on('diagram.destroy', () => {
      clearTimeout(deferredPaste);
      window.removeEventListener('keydown', onKeydownCapture, true);
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('blur', markSystemClipboardNewer);
      document.removeEventListener('copy', markSystemClipboardNewer);
      document.removeEventListener('cut', markSystemClipboardNewer);
      window.removeEventListener('paste', onPaste);
      container.removeEventListener('mousemove', onPointerMove);
      container.removeEventListener('mouseleave', onPointerLeave);
    });
  }

  /**
   * With the pointer over the canvas the new node attaches to it (like palette create; placing it
   * opens the name editor). Without one — keyboard only — it lands in the centre of the free
   * rectangle (within the plot) and the name editor opens right away.
   */
  private quickCreate(type: WardleyShapeType, label: string): void {
    const shape = this.factory.createNew(type, label) as unknown as Shape;
    if (this.pointerOverCanvas) {
      this.create.start(this.mouse.getLastMoveEvent(), shape);
      return;
    }
    const bounds = this.insetPlotBounds();
    const created = this.modeling.createShape(
      shape,
      this.freeSpotNear(this.visiblePlotCenter(bounds), bounds),
      this.canvas.getRootElement() as Shape,
    );
    this.selection.select(created);
    this.labelEditing?.activate(created as unknown as WardleyShape);
  }

  private insetPlotBounds(): PlotBounds | null {
    if (!this.grid) return null;
    const topLeft = this.grid.toCanvas({ visibility: 1, evolution: 0 });
    const bottomRight = this.grid.toCanvas({ visibility: 0, evolution: 1 });
    return {
      left: topLeft.x + PLOT_INSET,
      top: topLeft.y + PLOT_INSET,
      right: bottomRight.x - PLOT_INSET,
      bottom: bottomRight.y - PLOT_INSET,
    };
  }

  private visiblePlotCenter(bounds: PlotBounds | null): { x: number; y: number } {
    const viewbox = this.canvas.viewbox();
    const center = this.freeRect?.center() ?? {
      x: viewbox.x + viewbox.width / 2,
      y: viewbox.y + viewbox.height / 2,
    };
    if (!bounds) return center;
    return {
      x: clamp(center.x, bounds.left, bounds.right),
      y: clamp(center.y, bounds.top, bounds.bottom),
    };
  }

  private freeSpotNear(
    point: { x: number; y: number },
    bounds: PlotBounds | null,
  ): { x: number; y: number } {
    const occupied = (candidate: { x: number; y: number }) =>
      !!this.elementRegistry.find(
        (el) =>
          isWardleyShape(el) &&
          Math.abs(el.x + el.width / 2 - candidate.x) < STACK_CLEARANCE.x &&
          Math.abs(el.y + el.height / 2 - candidate.y) < STACK_CLEARANCE.y,
      );
    let candidate = point;
    for (let attempt = 0; attempt < STACK_ATTEMPTS && occupied(candidate); attempt++) {
      candidate = { x: candidate.x, y: candidate.y + STACK_STEP };
      if (bounds && candidate.y > bounds.bottom) {
        candidate = { x: candidate.x + STACK_COLUMN_STEP, y: point.y };
        if (candidate.x > bounds.right) return point;
      }
    }
    return candidate;
  }

  private singleSelectedShape(): WardleyShape | undefined {
    const selected = this.selection.get();
    return selected.length === 1 && isWardleyShape(selected[0]) ? selected[0] : undefined;
  }

  /** The real pointer event, or a synthetic one at `canvasPoint` when the pointer is elsewhere. */
  private pointerEventOr(canvasPoint: { x: number; y: number }): MouseEvent {
    if (this.pointerOverCanvas) return this.mouse.getLastMoveEvent();
    const viewbox = this.canvas.viewbox();
    const scale = this.canvas.zoom();
    const rect = this.canvas.getContainer().getBoundingClientRect();
    return new MouseEvent('mousemove', {
      clientX: rect.left + (canvasPoint.x - viewbox.x) * scale,
      clientY: rect.top + (canvasPoint.y - viewbox.y) * scale,
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return min > max ? (min + max) / 2 : Math.min(Math.max(value, min), max);
}
