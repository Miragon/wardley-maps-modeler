import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type { Method } from '@wardley/schema-model';
import type { WardleyShape } from '../model/di-types.js';
import { noteMetrics } from '../draw/styles.js';
import UpdatePropertiesHandler from './cmd/UpdatePropertiesHandler.js';

const UPDATE_PROPERTIES = 'element.updateProperties';

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

export interface EvolveOptions {
  newLabel?: string;
  method?: Method;
}

/**
 * High-Level-Mutationen auf Wardley-Shapes, die ueber den commandStack laufen (Undo/Redo, P4).
 * Registriert den generischen UpdatePropertiesHandler beim Bootstrap.
 */
export default class WardleyModeling {
  static $inject = ['commandStack'];

  constructor(private readonly commandStack: CommandStack) {
    commandStack.registerHandler(UPDATE_PROPERTIES, UpdatePropertiesHandler);
  }

  updateProperties(element: WardleyShape, properties: Record<string, unknown>): void {
    this.commandStack.execute(UPDATE_PROPERTIES, { element, properties });
  }

  updateLabel(element: WardleyShape, label: string): void {
    // Notizen: Box (und damit die Move-/Klick-Hitbox) an den neuen Text anpassen, Center halten.
    if (element.wardleyType === 'note') {
      const { width, height } = noteMetrics(label);
      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      this.updateProperties(element, {
        wardleyLabel: label,
        width,
        height,
        x: cx - width / 2,
        y: cy - height / 2,
      });
      return;
    }
    this.updateProperties(element, { wardleyLabel: label });
  }

  evolveComponent(element: WardleyShape, targetEvolution: number, opts: EvolveOptions = {}): void {
    this.updateProperties(element, {
      movement: compact({
        targetEvolution: clamp01(targetEvolution),
        newLabel: opts.newLabel,
        method: opts.method,
      }),
    });
  }

  clearMovement(element: WardleyShape): void {
    this.updateProperties(element, { movement: undefined });
  }

  toggleInertia(element: WardleyShape): void {
    const dec: Record<string, unknown> = { ...(element.decorators ?? {}) };
    if (dec['inertia']) delete dec['inertia'];
    else dec['inertia'] = true;
    this.updateProperties(element, { decorators: Object.keys(dec).length ? dec : undefined });
  }

  setMethod(element: WardleyShape, method: Method | undefined): void {
    const dec: Record<string, unknown> = { ...(element.decorators ?? {}) };
    if (method) dec['method'] = method;
    else delete dec['method'];
    this.updateProperties(element, { decorators: Object.keys(dec).length ? dec : undefined });
  }

  /** Setzt market/ecosystem (exklusiv) oder entfernt beide (`undefined`). */
  setMarketEcosystem(element: WardleyShape, kind: 'market' | 'ecosystem' | undefined): void {
    const dec: Record<string, unknown> = { ...(element.decorators ?? {}) };
    delete dec['market'];
    delete dec['ecosystem'];
    if (kind) dec[kind] = true;
    this.updateProperties(element, { decorators: Object.keys(dec).length ? dec : undefined });
  }

  /** Setzt die Notiz-Farbe (CSS-Farbe/Hex) oder entfernt sie (`undefined` = Standardfarbe). */
  setColor(element: WardleyShape, color: string | undefined): void {
    this.updateProperties(element, { color });
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
