import type PopupMenu from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type { PopupMenuTarget } from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type {
  PopupMenuEntries,
  default as PopupMenuProvider,
} from 'diagram-js/lib/features/popup-menu/PopupMenuProvider';
import { isComponent, type WardleyShape } from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';

export const POPUP_PROVIDER_ID = 'wardley-element-settings';

const TYPE_GROUP = { id: 'type', name: 'Type' };
const METHOD_GROUP = { id: 'method', name: 'Sourcing' };
const PROP_GROUP = { id: 'props', name: 'Properties' };

function mark(active: boolean, label: string): string {
  return active ? `✓ ${label}` : label;
}

/**
 * Popup submenu (opened via the context pad gear) for directly setting type (normal/market/
 * ecosystem), sourcing (build/buy/outsource) and inertia — instead of cycle buttons.
 * All actions go through `wardleyModeling` (undo/redo).
 */
export default class WardleyElementSettingsProvider implements PopupMenuProvider {
  static $inject = ['popupMenu', 'wardleyModeling'];

  constructor(
    popupMenu: PopupMenu,
    private readonly modeling: WardleyModeling,
  ) {
    popupMenu.registerProvider(POPUP_PROVIDER_ID, this);
  }

  getPopupMenuEntries(target: PopupMenuTarget): PopupMenuEntries {
    const shape = (Array.isArray(target) ? target[0] : target) as WardleyShape | undefined;
    if (!isComponent(shape)) return {};
    return this.componentEntries(shape);
  }

  private componentEntries(shape: WardleyShape): PopupMenuEntries {
    const dec = shape.decorators ?? {};
    const kind = dec.ecosystem ? 'ecosystem' : dec.market ? 'market' : 'normal';
    const method = dec.method;

    return {
      'type-normal': {
        label: mark(kind === 'normal', 'Normal'),
        group: TYPE_GROUP,
        action: () => this.modeling.setMarketEcosystem(shape, undefined),
      },
      'type-market': {
        label: mark(kind === 'market', 'Market'),
        group: TYPE_GROUP,
        action: () => this.modeling.setMarketEcosystem(shape, 'market'),
      },
      'type-ecosystem': {
        label: mark(kind === 'ecosystem', 'Ecosystem'),
        group: TYPE_GROUP,
        action: () => this.modeling.setMarketEcosystem(shape, 'ecosystem'),
      },
      'method-none': {
        label: mark(!method, 'None'),
        group: METHOD_GROUP,
        action: () => this.modeling.setMethod(shape, undefined),
      },
      'method-build': {
        label: mark(method === 'build', 'Build'),
        group: METHOD_GROUP,
        action: () => this.modeling.setMethod(shape, 'build'),
      },
      'method-buy': {
        label: mark(method === 'buy', 'Buy'),
        group: METHOD_GROUP,
        action: () => this.modeling.setMethod(shape, 'buy'),
      },
      'method-outsource': {
        label: mark(method === 'outsource', 'Outsource'),
        group: METHOD_GROUP,
        action: () => this.modeling.setMethod(shape, 'outsource'),
      },
      'prop-inertia': {
        label: mark(!!dec.inertia, 'Inertia'),
        group: PROP_GROUP,
        action: () => this.modeling.toggleInertia(shape),
      },
    };
  }
}
