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
import { isWardleyShape, type WardleyShape } from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type WardleyLabelEditing from '../label-editing/WardleyLabelEditing.js';
import type WardleyEvolveDragging from '../evolve/WardleyEvolveDragging.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';
import { POPUP_PROVIDER_ID } from '../popup/index.js';
import {
  iconMarkup,
  ICON_ADD,
  ICON_ARROW_FORWARD,
  ICON_CLOSE,
  ICON_DELETE,
  ICON_DOUBLE_ARROW,
  ICON_EDIT,
  ICON_SETTINGS,
} from '../draw/icons.js';

/** Schnelle Default-Evolve-Distanz beim Klick (statt Drag). */
const EVOLVE_CLICK_STEP = 0.2;

/**
 * ContextPad-Eintrag als HTML mit Material-Icon. `draggable=true` ist Pflicht fuer Eintraege mit
 * `dragstart`-Aktion — sonst feuert diagram-js den Drag nicht.
 */
function cpHtml(icon: string, title: string, draggable = false): string {
  return `<div class="entry wardley-cp-entry"${draggable ? ' draggable="true"' : ''} title="${title}">${iconMarkup(icon)}</div>`;
}

/** Kontext-Aktionen je Element (Konzept §5.5). */
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
  ) {
    contextPad.registerProvider(this);
  }

  getContextPadEntries(element: Element): ContextPadEntries {
    if (!isWardleyShape(element)) return {};
    const shape = element as WardleyShape;
    const entries: ContextPadEntries = {};

    const connectable = shape.wardleyType === 'component' || shape.wardleyType === 'anchor';
    if (connectable) {
      // Komponente anhängen: zieht eine neue (blanko) Komponente auf und legt den Pfeil
      // automatisch an (diagram-js Create mit `source` -> modeling.appendShape). Per ⚙ konfigurierbar.
      const startAppend = (event: Event) => {
        const next = this.factory.createNew('component', 'Component');
        this.create.start(event as MouseEvent, next as unknown as Element, {
          source: shape as unknown as Element,
        });
      };
      entries['append'] = {
        group: 'edit',
        title: 'Append component (auto-connect)',
        html: cpHtml(ICON_ADD, 'Append component', true),
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
        entries['evolve-clear'] = {
          group: 'wardley',
          title: 'Remove evolve',
          html: cpHtml(ICON_CLOSE, 'Remove evolve'),
          action: { click: () => this.wardleyModeling.clearMovement(shape) },
        };
      } else {
        // Ziel per Drag setzen (oder Klick = +0.2 als Schnellaktion).
        entries['evolve'] = {
          group: 'wardley',
          title: 'Evolve: drag to set the target maturity (click = +0.2)',
          html: cpHtml(ICON_DOUBLE_ARROW, 'Evolve: drag to set the target maturity', true),
          action: {
            dragstart: (event: Event) => this.evolveDragging.start(event, shape),
            click: () =>
              this.wardleyModeling.evolveComponent(
                shape,
                Math.min(shape.evolution + EVOLVE_CLICK_STEP, 1),
              ),
          },
        };
      }

      // Einstellungs-Zahnrad -> Popup-Untermenue (Typ, Beschaffung, Inertia).
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

    entries['edit-label'] = {
      group: 'edit',
      title: 'Edit label',
      html: cpHtml(ICON_EDIT, 'Edit label'),
      action: { click: () => this.labelEditing.activate(shape) },
    };

    entries['delete'] = {
      group: 'edit',
      title: 'Delete',
      html: cpHtml(ICON_DELETE, 'Delete'),
      action: { click: () => this.modeling.removeElements([shape as unknown as Element]) },
    };

    return entries;
  }
}
