import type Palette from 'diagram-js/lib/features/palette/Palette';
import type Create from 'diagram-js/lib/features/create/Create';
import type LassoTool from 'diagram-js/lib/features/lasso-tool/LassoTool';
import type WardleyDrawTool from '../draw-tool/WardleyDrawTool.js';
import type {
  PaletteEntries,
  PaletteEntry,
  default as PaletteProvider,
} from 'diagram-js/lib/features/palette/PaletteProvider';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';
import type { CreateNewExtra } from '../model/WardleyElementFactory.js';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Parent, Shape } from 'diagram-js/lib/model/Types';
import type { Injector } from 'didi';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type { FreeRect } from '../free-rect/index.js';
import { isWardleyShape, type WardleyShape, type WardleyShapeType } from '../model/di-types.js';
import { PALETTE_ICONS, attitudeIcon } from '../draw/palette-icons.js';

interface PaletteSpec {
  key: string;
  type: WardleyShapeType;
  label: string;
  title: string;
  /** Single-key shortcut (bound by the keyboard module); shown in the palette tooltip. */
  shortcut?: string;
  icon: string;
  group: string;
  extra?: CreateNewExtra;
}

// Group IDs with a prefix number -> stable, visible ordering of the palette groups.
const GROUP_BLOCKS = 'wardley-1-blocks';
const GROUP_STRATEGY = 'wardley-2-strategy';
const GROUP_NOTES = 'wardley-3-notes';

const SPECS: readonly PaletteSpec[] = [
  {
    key: 'component',
    type: 'component',
    label: 'Component',
    title: 'Component',
    shortcut: 'C',
    icon: PALETTE_ICONS.component!,
    group: GROUP_BLOCKS,
  },
  {
    key: 'market',
    type: 'component',
    label: 'Market',
    title: 'Market component',
    icon: PALETTE_ICONS.market!,
    group: GROUP_BLOCKS,
    extra: { market: true },
  },
  {
    key: 'ecosystem',
    type: 'component',
    label: 'Ecosystem',
    title: 'Ecosystem component',
    icon: PALETTE_ICONS.ecosystem!,
    group: GROUP_BLOCKS,
    extra: { ecosystem: true },
  },
  {
    key: 'anchor',
    type: 'anchor',
    label: 'User',
    title: 'Anchor / User',
    shortcut: 'U',
    icon: PALETTE_ICONS.anchor!,
    group: GROUP_BLOCKS,
  },
  {
    key: 'pipeline',
    type: 'pipeline',
    label: 'Pipeline',
    title: 'Pipeline',
    shortcut: 'P',
    icon: PALETTE_ICONS.pipeline!,
    group: GROUP_BLOCKS,
  },
  {
    key: 'submap',
    type: 'submap',
    label: 'Submap',
    title: 'Submap',
    icon: PALETTE_ICONS.submap!,
    group: GROUP_BLOCKS,
  },

  {
    key: 'pioneers',
    type: 'attitude',
    label: 'Pioneers',
    title: 'Pioneers region',
    icon: attitudeIcon('pioneers'),
    group: GROUP_STRATEGY,
    extra: { attitudeKind: 'pioneers' },
  },
  {
    key: 'settlers',
    type: 'attitude',
    label: 'Settlers',
    title: 'Settlers region',
    icon: attitudeIcon('settlers'),
    group: GROUP_STRATEGY,
    extra: { attitudeKind: 'settlers' },
  },
  {
    key: 'townplanners',
    type: 'attitude',
    label: 'Town Planners',
    title: 'Town Planners region',
    icon: attitudeIcon('townplanners'),
    group: GROUP_STRATEGY,
    extra: { attitudeKind: 'townplanners' },
  },
  {
    key: 'accelerator',
    type: 'accelerator',
    label: 'Accelerate',
    title: 'Accelerator',
    icon: PALETTE_ICONS.accelerator!,
    group: GROUP_STRATEGY,
    extra: { acceleratorDirection: 'accelerate' },
  },
  {
    key: 'deaccelerator',
    type: 'accelerator',
    label: 'Deaccelerate',
    title: 'Deaccelerator',
    icon: PALETTE_ICONS.deaccelerator!,
    group: GROUP_STRATEGY,
    extra: { acceleratorDirection: 'deaccelerate' },
  },

  // Annotations (numbered markers + legend) are deliberately NOT in the palette: Note covers
  // free text; imported OWM maps still render annotations (viewer compatibility).
  {
    key: 'note',
    type: 'note',
    label: 'Note',
    title: 'Note',
    shortcut: 'N',
    icon: PALETTE_ICONS.note!,
    group: GROUP_NOTES,
  },
];

interface ToolSpec {
  key: string;
  title: string;
  shortcut?: string;
  icon: string;
}

// Names in sentence case, keys apart (guide §5.6): the chrome tooltip shows the key as a chip, and
// the gestures (Shift+drag, how a drawing ends) are listed in the keyboard shortcuts.
const LASSO_TOOL: ToolSpec = {
  key: 'lasso-tool',
  title: 'Lasso',
  shortcut: 'L',
  icon: PALETTE_ICONS.lasso!,
};

const DRAW_TOOL: ToolSpec = {
  key: 'draw-tool',
  title: 'Draw',
  icon: PALETTE_ICONS.draw!,
};

/** Leaves room so a keyboard-created shape is not clipped by the plot edge. */
const PLOT_INSET = 24;
/** Diagonal step while the free centre is taken (guide §5.5). */
const STACK_OFFSET = 24;
const MAX_STACK_STEPS = 12;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Enter or Space on an entry arrives as a click without a pointer: the keyboard of the Miragon
 * modeler shell dispatches it with `detail === 0`, every pointer click has 1 or more.
 */
function isKeyboardClick(event: Event): boolean {
  return event.type === 'click' && (event as MouseEvent).detail === 0;
}

export default class WardleyPaletteProvider implements PaletteProvider {
  static $inject = [
    'palette',
    'create',
    'wardleyElementFactory',
    'lassoTool',
    'wardleyDrawTool',
    'injector',
  ];

  /**
   * diagram-js >= 15.28 renders `title` + `shortcut` as a styled tooltip, and the Miragon modeler
   * shell shows its chrome tooltip instead; only without either does an entry need a native title.
   */
  private readonly needsNativeTitle: boolean;

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly factory: WardleyElementFactory,
    private readonly lassoTool: LassoTool,
    private readonly drawTool: WardleyDrawTool,
    private readonly injector: Injector,
  ) {
    // The horizontal toolbar never needs diagram-js' vertical two-column collapse, which would
    // squeeze it to 94px on canvases lower than ~694px and spill the entries out of the bar.
    (palette as unknown as { _needsCollapse: () => boolean })._needsCollapse = () => false;
    this.needsNativeTitle =
      !injector.get('paletteTooltip', false) && !injector.get('modelerShell', false);
    palette.registerProvider(this);
  }

  getPaletteEntries(): PaletteEntries {
    const entries: Record<string, PaletteEntry> = {};

    // Selection tool first. Group MUST be called "tools" and the key end in "-tool" — that is
    // what diagram-js' palette uses to highlight the active tool (tool-manager.update).
    entries[LASSO_TOOL.key] = {
      group: 'tools',
      ...this.describe(LASSO_TOOL.title, LASSO_TOOL.shortcut),
      html: this.entryHtml(LASSO_TOOL.title, LASSO_TOOL.icon, LASSO_TOOL.shortcut),
      action: {
        click: (event: Event) => this.lassoTool.activateSelection(event as MouseEvent),
      },
    };

    entries[DRAW_TOOL.key] = {
      group: 'tools',
      ...this.describe(DRAW_TOOL.title, DRAW_TOOL.shortcut),
      html: this.entryHtml(DRAW_TOOL.title, DRAW_TOOL.icon, DRAW_TOOL.shortcut),
      action: {
        click: () => this.drawTool.toggle(),
      },
    };

    for (const spec of SPECS) {
      const start = (event: Event) => {
        this.create.start(event, this.createShapeFor(spec));
      };
      // diagram-js's create follows the pointer and never ends without one.
      const click = (event: Event) => {
        if (isKeyboardClick(event)) this.createAtFreeCenter(`create.${spec.key}`);
        else start(event);
      };
      entries[`create.${spec.key}`] = {
        group: spec.group,
        ...this.describe(spec.title, spec.shortcut),
        html: this.entryHtml(spec.title, spec.icon, spec.shortcut, true),
        action: { dragstart: start, click },
      };
    }
    return entries;
  }

  /**
   * Keyboard path for a create entry (guide §5.5): places the new element in the centre of the
   * free rectangle (no pointer position to attach it to), 24px further diagonally while that spot
   * is taken, selects it and opens its label editor, or focuses the canvas where there is nothing
   * to name. Returns the created shape, or undefined for non-create entries.
   */
  createAtFreeCenter(entryId: string): WardleyShape | undefined {
    const spec = SPECS.find((candidate) => `create.${candidate.key}` === entryId);
    if (!spec) return undefined;
    const modeling = this.injector.get<Modeling>('modeling');
    const canvas = this.injector.get<Canvas>('canvas');
    const grid = this.injector.get<EvolutionGrid>('evolutionGrid');

    const shape = this.createShapeFor(spec);
    const position = this.freeCenterPosition(shape, canvas, grid);
    modeling.createShape(
      shape as unknown as Shape,
      position,
      canvas.getRootElement() as unknown as Parent,
    );

    this.injector.get<Selection>('selection', false)?.select(shape as unknown as Shape);
    canvas.focus();
    // Regions are unlabelled (OWM canon), so there is nothing to name.
    if (spec.type !== 'attitude') {
      this.injector.get<LabelEditingLike>('wardleyLabelEditing', false)?.activate(shape);
    }
    return shape;
  }

  private createShapeFor(spec: PaletteSpec): WardleyShape {
    return this.factory.createNew(spec.type, spec.label, spec.extra ?? {});
  }

  private freeCenterPosition(
    shape: WardleyShape,
    canvas: Canvas,
    grid: EvolutionGrid,
  ): { x: number; y: number } {
    const freeCenter =
      this.injector.get<FreeRect | null>('wardleyFreeRect', false)?.center() ??
      (({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 }))(canvas.viewbox());
    const plotTopLeft = grid.toCanvas({ evolution: 0, visibility: 1 });
    const plotBottomRight = grid.toCanvas({ evolution: 1, visibility: 0 });
    const clampAxis = (value: number, min: number, max: number, extent: number) => {
      const low = min + extent / 2 + PLOT_INSET;
      const high = max - extent / 2 - PLOT_INSET;
      return low > high ? (min + max) / 2 : Math.min(high, Math.max(low, value));
    };
    const centerOf = (step: number) => ({
      x: clampAxis(
        freeCenter.x + step * STACK_OFFSET,
        plotTopLeft.x,
        plotBottomRight.x,
        shape.width,
      ),
      y: clampAxis(
        freeCenter.y + step * STACK_OFFSET,
        plotTopLeft.y,
        plotBottomRight.y,
        shape.height,
      ),
    });
    const registry = this.injector.get<ElementRegistry>('elementRegistry');
    // Regions and drawings are backgrounds that other elements sit on, so only nodes block a spot.
    const occupied = (point: { x: number; y: number }) =>
      registry.find(
        (element: unknown) =>
          isWardleyShape(element) &&
          element.wardleyType !== 'attitude' &&
          element.wardleyType !== 'drawing' &&
          Math.abs(element.x + element.width / 2 - point.x) < (element.width + shape.width) / 2 &&
          Math.abs(element.y + element.height / 2 - point.y) < (element.height + shape.height) / 2,
      ) !== undefined;
    for (let step = 0; step < MAX_STACK_STEPS; step++) {
      const candidate = centerOf(step);
      if (!occupied(candidate)) return candidate;
    }
    return centerOf(0);
  }

  private describe(
    title: string,
    shortcut: string | undefined,
  ): Pick<PaletteEntry, 'title' | 'shortcut'> {
    return shortcut ? { title, shortcut } : { title };
  }

  private entryHtml(title: string, icon: string, shortcut?: string, draggable = false): string {
    // Next to a styled tooltip a native `title` would pop up a second, slower one.
    const nativeTitle = this.needsNativeTitle
      ? ` title="${escapeAttribute(shortcut ? `${title} — ${shortcut}` : title)}"`
      : '';
    const keyShortcut = shortcut ? ` aria-keyshortcuts="${escapeAttribute(shortcut)}"` : '';
    return `<div class="entry wardley-palette-entry"${draggable ? ' draggable="true"' : ''}${nativeTitle}${keyShortcut}>${icon}</div>`;
  }
}

interface LabelEditingLike {
  activate(element: WardleyShape): void;
}
