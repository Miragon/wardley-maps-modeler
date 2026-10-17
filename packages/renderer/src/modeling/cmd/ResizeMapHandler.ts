import type CommandHandler from 'diagram-js/lib/command/CommandHandler';
import type { ElementLike } from 'diagram-js/lib/core/Types';
import type { MapSize } from '@miragon/wardley-schema-model';
import type { RootBusinessObject } from '../../io/index.js';
import {
  configWithSize,
  withoutRawSizeStatements,
  type MapProjection,
} from '../../map-resize/index.js';

export interface ResizeMapContext {
  /** New explicit size; `undefined` removes the `size` line (default plot). */
  size: MapSize | undefined;
  /** set internally by the handler (for revert). */
  oldSize?: MapSize | undefined;
  oldRawPassthrough?: readonly string[] | undefined;
}

/**
 * Undoable map resize: changes `config.size` and re-projects the existing shapes in place from
 * their normalized model. Only the size (and superseded raw `size` lines) is touched, so the DSL
 * changes in exactly one line.
 */
export default class ResizeMapHandler implements CommandHandler {
  static $inject = ['wardleyMapProjection'];

  constructor(private readonly projection: MapProjection) {}

  execute(context: ResizeMapContext): ElementLike[] {
    const businessObject = this.projection.root()?.businessObject;
    if (!businessObject) return [];
    context.oldSize = businessObject.config.size;
    context.oldRawPassthrough = businessObject.rawPassthrough;
    // An unreadable `size` line kept in the passthrough would be written after the new one, and
    // OWM lets the last size line win.
    return this.projection.apply(
      withRawPassthrough(
        { ...businessObject, config: configWithSize(businessObject.config, context.size) },
        withoutRawSizeStatements(businessObject.rawPassthrough),
      ),
    );
  }

  revert(context: ResizeMapContext): ElementLike[] {
    const businessObject = this.projection.root()?.businessObject;
    if (!businessObject) return [];
    return this.projection.apply(
      withRawPassthrough(
        { ...businessObject, config: configWithSize(businessObject.config, context.oldSize) },
        context.oldRawPassthrough,
      ),
    );
  }
}

function withRawPassthrough(
  businessObject: RootBusinessObject,
  rawPassthrough: readonly string[] | undefined,
): RootBusinessObject {
  const { rawPassthrough: _previous, ...rest } = businessObject;
  return rawPassthrough ? { ...rest, rawPassthrough } : rest;
}
