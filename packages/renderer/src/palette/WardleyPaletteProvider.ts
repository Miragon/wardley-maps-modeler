import type Palette from 'diagram-js/lib/features/palette/Palette';
import type Create from 'diagram-js/lib/features/create/Create';
import type LassoTool from 'diagram-js/lib/features/lasso-tool/LassoTool';
import type {
  PaletteEntries,
  PaletteEntry,
  default as PaletteProvider,
} from 'diagram-js/lib/features/palette/PaletteProvider';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';
import type { CreateNewExtra } from '../model/WardleyElementFactory.js';
import type { WardleyShapeType } from '../model/di-types.js';
import { PALETTE_ICONS, attitudeIcon } from '../draw/palette-icons.js';

interface PaletteSpec {
  key: string;
  type: WardleyShapeType;
  label: string;
  title: string;
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
    icon: PALETTE_ICONS.anchor!,
    group: GROUP_BLOCKS,
  },
  {
    key: 'pipeline',
    type: 'pipeline',
    label: 'Pipeline',
    title: 'Pipeline',
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
    icon: PALETTE_ICONS.note!,
    group: GROUP_NOTES,
  },
];

export default class WardleyPaletteProvider implements PaletteProvider {
  static $inject = ['palette', 'create', 'wardleyElementFactory', 'lassoTool'];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly factory: WardleyElementFactory,
    private readonly lassoTool: LassoTool,
  ) {
    palette.registerProvider(this);
  }

  getPaletteEntries(): PaletteEntries {
    const entries: Record<string, PaletteEntry> = {};

    // Selection tool first. Group MUST be called "tools" and the key end in "-tool" — that is
    // what diagram-js' palette uses to highlight the active tool (tool-manager.update).
    entries['lasso-tool'] = {
      group: 'tools',
      title: 'Selection tool (or Shift+drag on the canvas)',
      html: `<div class="entry wardley-palette-entry" title="Selection tool (or Shift+drag on the canvas)">${PALETTE_ICONS.lasso}</div>`,
      action: {
        click: (event: Event) => this.lassoTool.activateSelection(event as MouseEvent),
      },
    };

    for (const spec of SPECS) {
      const start = (event: Event) => {
        const shape = this.factory.createNew(spec.type, spec.label, spec.extra ?? {});
        this.create.start(event, shape);
      };
      entries[`create.${spec.key}`] = {
        group: spec.group,
        title: spec.title,
        html: `<div class="entry wardley-palette-entry" draggable="true" title="${spec.title}">${spec.icon}</div>`,
        action: { dragstart: start, click: start },
      };
    }
    return entries;
  }
}
