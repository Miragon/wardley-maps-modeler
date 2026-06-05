import type { ElementLike } from 'diagram-js/lib/core/Types';
import type CommandHandler from 'diagram-js/lib/command/CommandHandler';

export interface UpdatePropertiesContext {
  element: ElementLike & Record<string, unknown>;
  properties: Record<string, unknown>;
  /** intern vom Handler gesetzt (fuer revert). */
  oldProperties?: Record<string, unknown>;
}

function setOrDelete(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) delete obj[key];
  else obj[key] = value;
}

/**
 * Generischer, undo-faehiger Command-Handler zum Setzen beliebiger Wardley-Properties
 * (wardleyLabel, decorators, movement, evolutionStart/End, ...). Gibt das geaenderte Element
 * zurueck -> CommandStack feuert `elements.changed` -> Re-Render.
 */
export default class UpdatePropertiesHandler implements CommandHandler {
  execute(context: UpdatePropertiesContext): ElementLike[] {
    const { element, properties } = context;
    const target = element as unknown as Record<string, unknown>;
    const old: Record<string, unknown> = {};
    for (const key of Object.keys(properties)) {
      old[key] = target[key];
      setOrDelete(target, key, properties[key]);
    }
    context.oldProperties = old;
    return [element];
  }

  revert(context: UpdatePropertiesContext): ElementLike[] {
    const { element, oldProperties } = context;
    const target = element as unknown as Record<string, unknown>;
    if (oldProperties) {
      for (const key of Object.keys(oldProperties)) setOrDelete(target, key, oldProperties[key]);
    }
    return [element];
  }
}
