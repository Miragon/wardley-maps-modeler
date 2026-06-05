import type Palette from 'diagram-js/lib/features/palette/Palette';
import type Create from 'diagram-js/lib/features/create/Create';
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

// Gruppen-IDs mit Praefix-Nummer -> stabile, sichtbare Reihenfolge der Palette-Gruppen.
const GROUP_BLOCKS = 'wardley-1-blocks';
const GROUP_STRATEGY = 'wardley-2-strategy';
const GROUP_NOTES = 'wardley-3-notes';

const SPECS: readonly PaletteSpec[] = [
  // --- Bausteine (Wertschöpfungskette) ---
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

  // --- Strategie & Klima ---
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

  // --- Anmerkungen ---
  {
    key: 'note',
    type: 'note',
    label: 'Note',
    title: 'Note',
    icon: PALETTE_ICONS.note!,
    group: GROUP_NOTES,
  },
  {
    key: 'annotation',
    type: 'annotation',
    label: 'Annotation',
    title: 'Annotation (numbered marker)',
    icon: PALETTE_ICONS.annotation!,
    group: GROUP_NOTES,
    extra: { annotationNumber: 1 },
  },
];

/** Werkzeug-Palette: erzeugt alle Wardley-Element-Typen per Drag-to-create; Icons = Canvas-Vorschau. */
export default class WardleyPaletteProvider implements PaletteProvider {
  static $inject = ['palette', 'create', 'wardleyElementFactory'];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly factory: WardleyElementFactory,
  ) {
    palette.registerProvider(this);
  }

  getPaletteEntries(): PaletteEntries {
    const entries: Record<string, PaletteEntry> = {};
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
