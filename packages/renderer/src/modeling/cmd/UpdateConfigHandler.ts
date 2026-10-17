import type CommandHandler from 'diagram-js/lib/command/CommandHandler';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike } from 'diagram-js/lib/core/Types';
import type { MapConfig } from '@miragon/wardley-schema-model';
import type EvolutionGrid from '../../evolution-grid/EvolutionGrid.js';
import { wardleyRootOf } from '../../map-resize/index.js';

/**
 * Config fields a `wardley.config.update` may change; `undefined` removes the field. The size is
 * excluded on purpose: it needs the re-projection of `wardley.map.resize`.
 */
export type MapConfigUpdate = {
  -readonly [Key in Exclude<keyof MapConfig, 'size'>]?: MapConfig[Key] | undefined;
};

export interface UpdateConfigContext {
  properties: MapConfigUpdate;
  /** set internally by the handler (for revert). */
  oldProperties?: MapConfigUpdate;
}

/**
 * Writes `update` into the root's config (`undefined` removes a field; `size` is left alone, it
 * needs the re-projection of `wardley.map.resize`), redraws the axes and fires
 * `wardley.config.changed`. Returns the previous values of exactly the written fields. The one place
 * a config changes in place: the undoable command and the viewers' direct path both use it.
 */
export function applyConfigUpdate(
  canvas: Canvas,
  grid: EvolutionGrid,
  eventBus: EventBus,
  update: MapConfigUpdate,
  options: { transient?: boolean } = {},
): MapConfigUpdate {
  const root = wardleyRootOf(canvas);
  if (!root?.businessObject) return {};
  const previous: Record<string, unknown> = {};
  const config: Record<string, unknown> = { ...root.businessObject.config };
  for (const [key, value] of Object.entries(update)) {
    if (key === 'size') continue;
    previous[key] = config[key];
    if (value === undefined) delete config[key];
    else config[key] = value;
  }
  const nextConfig = config as unknown as MapConfig;
  root.businessObject = { ...root.businessObject, config: nextConfig };
  grid.configure(nextConfig);
  grid.render();
  eventBus.fire('wardley.config.changed', {
    config: nextConfig,
    ...(options.transient ? { transient: true } : {}),
  });
  return previous as MapConfigUpdate;
}

/**
 * Undoable change of map config fields (title, evolution labels, …). Only the given fields are
 * swapped, so it composes with any other config change in the undo history.
 */
export default class UpdateConfigHandler implements CommandHandler {
  static $inject = ['canvas', 'evolutionGrid', 'eventBus'];

  constructor(
    private readonly canvas: Canvas,
    private readonly grid: EvolutionGrid,
    private readonly eventBus: EventBus,
  ) {}

  execute(context: UpdateConfigContext): ElementLike[] {
    context.oldProperties = this.apply(context.properties);
    return [];
  }

  revert(context: UpdateConfigContext): ElementLike[] {
    if (context.oldProperties) this.apply(context.oldProperties);
    return [];
  }

  private apply(properties: MapConfigUpdate): MapConfigUpdate {
    return applyConfigUpdate(this.canvas, this.grid, this.eventBus, properties);
  }
}
