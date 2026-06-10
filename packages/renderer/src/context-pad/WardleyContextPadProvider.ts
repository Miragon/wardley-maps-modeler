import type ContextPad from 'diagram-js/lib/features/context-pad/ContextPad';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Connect from 'diagram-js/lib/features/connect/Connect';
import type Create from 'diagram-js/lib/features/create/Create';
import type PopupMenu from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type {
  ContextPadEntries,
  default as ContextPadProvider,
} from 'diagram-js/lib/features/context-pad/ContextPadProvider';
import type { Element } from 'diagram-js/lib/model/Types';
import type { ComponentElement, SubmapElement } from '@miragon/wardley-schema-model';
import {
  isWardleyShape,
  isWardleyConnection,
  type WardleyConnection,
  type WardleyShape,
} from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type WardleyLabelEditing from '../label-editing/WardleyLabelEditing.js';
import type WardleyEvolveDragging from '../evolve/WardleyEvolveDragging.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';
import type WardleyColorPicker from '../color-picker/WardleyColorPicker.js';
import { POPUP_PROVIDER_ID } from '../popup/index.js';
import {
  iconMarkup,
  ICON_CIRCLE,
  ICON_ARROW_FORWARD,
  ICON_CLOSE,
  ICON_DELETE,
  ICON_DOUBLE_ARROW,
  ICON_EDIT,
  ICON_PALETTE,
  ICON_SETTINGS,
  ICON_SWAP_HORIZ,
} from '../draw/icons.js';

/**
 * ContextPad entry as HTML with a Material icon. `draggable=true` is mandatory for entries with a
 * `dragstart` action — otherwise diagram-js does not fire the drag.
 */
function cpHtml(icon: string, title: string, draggable = false): string {
  return `<div class="entry wardley-cp-entry"${draggable ? ' draggable="true"' : ''} title="${title}">${iconMarkup(icon)}</div>`;
}

/** Context actions per element (concept doc §5.5). */
export default class WardleyContextPadProvider implements ContextPadProvider {
  static $inject = [
    'contextPad',
    'modeling',
    'connect',
    'create',
    'popupMenu',
    'wardleyModeling',
    'wardleyLabelEditing',
    'wardleyEvolveDragging',
    'wardleyElementFactory',
    'wardleyColorPicker',
  ];

  constructor(
    contextPad: ContextPad,
    private readonly modeling: Modeling,
    private readonly connect: Connect,
    private readonly create: Create,
    private readonly popupMenu: PopupMenu,
    private readonly wardleyModeling: WardleyModeling,
    private readonly labelEditing: WardleyLabelEditing,
    private readonly evolveDragging: WardleyEvolveDragging,
    private readonly factory: WardleyElementFactory,
    private readonly colorPicker: WardleyColorPicker,
  ) {
    contextPad.registerProvider(this);
  }

  getContextPadEntries(element: Element): ContextPadEntries {
    // Connections: edit the annotation (or the flow value of an imported flow link) + delete.
    if (isWardleyConnection(element)) {
      const conn = element as WardleyConnection;
      const isFlow = conn.wardleyType === 'flow';
      return {
        'edit-value': {
          group: 'edit',
          title: isFlow ? 'Edit flow value' : 'Edit link annotation',
          html: cpHtml(ICON_EDIT, isFlow ? 'Edit flow value' : 'Edit link annotation'),
          action: { click: () => this.labelEditing.activateConnection(conn) },
        },
        delete: {
          group: 'edit',
          title: 'Delete connection',
          html: cpHtml(ICON_DELETE, 'Delete connection'),
          action: { click: () => this.modeling.removeElements([element]) },
        },
      };
    }
    if (!isWardleyShape(element)) return {};
    const shape = element as WardleyShape;
    const entries: ContextPadEntries = {};

    const connectable =
      shape.wardleyType === 'component' ||
      shape.wardleyType === 'anchor' ||
      shape.wardleyType === 'submap' ||
      shape.wardleyType === 'pipeline';
    if (connectable) {
      // Append component: drags out a new (blank) component and creates the arrow automatically
      // (diagram-js Create with `source` -> modeling.appendShape). Configurable via ⚙.
      const startAppend = (event: Event) => {
        const next = this.factory.createNew('component', 'Component');
        this.create.start(event as MouseEvent, next as unknown as Element, {
          source: shape as unknown as Element,
        });
      };
      entries['append'] = {
        group: 'edit',
        title: 'Append component (auto-connect)',
        html: cpHtml(ICON_CIRCLE, 'Append component', true),
        action: { click: startAppend, dragstart: startAppend },
      };

      const startConnect = (event: Event) => {
        this.connect.start(event as MouseEvent, shape as unknown as Element);
      };
      entries['connect'] = {
        group: 'edit',
        title: 'Connect to existing element',
        html: cpHtml(ICON_ARROW_FORWARD, 'Connect to existing element', true),
        action: { click: startConnect, dragstart: startConnect },
      };
    }

    if (shape.wardleyType === 'component') {
      if (shape.movement) {
        // Target is set -> drag the red target circle directly to MOVE it
        // (see WardleyEvolveDragging). Here we only offer removal.
        entries['evolve-clear'] = {
          group: 'wardley',
          title: 'Remove evolve',
          html: cpHtml(ICON_CLOSE, 'Remove evolve'),
          action: { click: () => this.wardleyModeling.clearMovement(shape) },
        };
      } else if (shape.evolution < 0.999) {
        // Drag the target out along the axis (live preview). The click does NOT model immediately
        // (no automatic +0.2 anymore) — it only starts the placement. At evolution ~ 1 there is
        // no meaningful target left — the entry is omitted (instead of creating a null movement).
        const startEvolve = (event: Event) => this.evolveDragging.start(event, shape);
        entries['evolve'] = {
          group: 'wardley',
          title: 'Evolve: drag to set the target maturity',
          html: cpHtml(ICON_DOUBLE_ARROW, 'Evolve: drag to set the target maturity', true),
          action: { click: startEvolve, dragstart: startEvolve },
        };
      }

      entries['settings'] = {
        group: 'wardley',
        title: 'Settings (type, sourcing, inertia)',
        html: cpHtml(ICON_SETTINGS, 'Settings'),
        action: {
          click: (event: Event) => {
            const e = event as MouseEvent;
            this.popupMenu.open(shape as unknown as Element, POPUP_PROVIDER_ID, {
              x: e.clientX,
              y: e.clientY,
            });
          },
        },
      };
    }

    // Drawings: cycle the stroke style (solid -> dashed -> dotted).
    if (shape.wardleyType === 'drawing') {
      const next =
        shape.strokeStyle === 'dashed'
          ? 'dotted'
          : shape.strokeStyle === 'dotted'
            ? undefined
            : 'dashed';
      const title = `Line style: ${shape.strokeStyle ?? 'solid'} (click to change)`;
      entries['stroke-style'] = {
        group: 'wardley',
        title,
        html: cpHtml(ICON_SWAP_HORIZ, title),
        action: {
          click: () => this.wardleyModeling.updateProperties(shape, { strokeStyle: next }),
        },
      };
    }

    // Color is available on EVERY element (model-wide `color`, DSL extension `(color ...)`).
    entries['color'] = {
      group: 'wardley',
      title: 'Color',
      html: cpHtml(ICON_PALETTE, 'Color'),
      action: {
        click: (event: Event) => {
          const e = event as MouseEvent;
          this.colorPicker.open(shape, e.clientX, e.clientY);
        },
      },
    };

    // OWM `url(...)`: open the stored address (submap drill-down / component link).
    const bo = shape.businessObject;
    const linkUrl =
      (bo as ComponentElement | undefined)?.url ?? (bo as SubmapElement | undefined)?.urlRef;
    if (linkUrl) {
      entries['open-link'] = {
        group: 'wardley',
        title: `Open link (${linkUrl})`,
        html: cpHtml(ICON_ARROW_FORWARD, 'Open link'),
        action: { click: () => window.open(linkUrl, '_blank', 'noopener') },
      };
    }

    // Drawings have no label (pure geometry).
    if (shape.wardleyType !== 'drawing') {
      entries['edit-label'] = {
        group: 'edit',
        title: 'Edit label',
        html: cpHtml(ICON_EDIT, 'Edit label'),
        action: { click: () => this.labelEditing.activate(shape) },
      };
    }

    entries['delete'] = {
      group: 'edit',
      title: 'Delete',
      html: cpHtml(ICON_DELETE, 'Delete'),
      action: { click: () => this.modeling.removeElements([shape as unknown as Element]) },
    };

    return entries;
  }
}
