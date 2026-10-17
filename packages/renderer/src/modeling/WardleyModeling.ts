import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type { MapConfig, MapSize, Method } from '@miragon/wardley-schema-model';
import type { WardleyConnection, WardleyShape } from '../model/di-types.js';
import { noteMetrics } from '../draw/styles.js';
import { wardleyRootOf } from '../map-resize/index.js';
import UpdatePropertiesHandler from './cmd/UpdatePropertiesHandler.js';
import ResizeMapHandler from './cmd/ResizeMapHandler.js';
import UpdateConfigHandler, { type MapConfigUpdate } from './cmd/UpdateConfigHandler.js';

const UPDATE_PROPERTIES = 'element.updateProperties';
export const RESIZE_MAP = 'wardley.map.resize';
export const UPDATE_CONFIG = 'wardley.config.update';

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
 * High-level mutations on Wardley shapes that run through the commandStack (undo/redo, P4).
 * Registers the generic UpdatePropertiesHandler at bootstrap.
 */
export default class WardleyModeling {
  static $inject = ['commandStack', 'canvas'];

  constructor(
    private readonly commandStack: CommandStack,
    private readonly canvas: Canvas,
  ) {
    commandStack.registerHandler(UPDATE_PROPERTIES, UpdatePropertiesHandler);
    commandStack.registerHandler(RESIZE_MAP, ResizeMapHandler);
    commandStack.registerHandler(UPDATE_CONFIG, UpdateConfigHandler);
  }

  /**
   * Sets the plot size (`undefined` removes the `size` line) as one undoable step that re-projects
   * the shapes in place. Pass an already normalized size (see `normalizeMapSize`). Does nothing
   * when the config would not change.
   */
  resizeMap(size: MapSize | undefined): void {
    const config = this.currentConfig();
    if (!config || sameSize(config.size, size)) return;
    this.commandStack.execute(RESIZE_MAP, { size });
  }

  /** Changes config fields (title, labels, …) as one undoable step; `undefined` removes a field. */
  updateConfig(properties: MapConfigUpdate): void {
    const config = this.currentConfig();
    if (!config) return;
    const current = config as unknown as Record<string, unknown>;
    const changed = Object.fromEntries(
      Object.entries(properties).filter(
        ([key, value]) => key !== 'size' && JSON.stringify(current[key]) !== JSON.stringify(value),
      ),
    ) as MapConfigUpdate;
    if (Object.keys(changed).length === 0) return;
    this.commandStack.execute(UPDATE_CONFIG, { properties: changed });
  }

  private currentConfig(): MapConfig | undefined {
    return wardleyRootOf(this.canvas)?.businessObject?.config;
  }

  updateProperties(
    element: WardleyShape | WardleyConnection,
    properties: Record<string, unknown>,
  ): void {
    this.commandStack.execute(UPDATE_PROPERTIES, { element, properties });
  }

  updateLabel(element: WardleyShape, label: string): void {
    // Notes: resize the box (and thus the move/click hitbox) to the new text, keeping the center.
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
    const target = clamp01(targetEvolution);
    // Evolution only moves forward (canon) — silently ignore targets left of the current position.
    if (target <= element.evolution) return;
    // Retargeting keeps what the user already gave the evolve line (new name, method, label offset).
    this.updateProperties(element, {
      movement: compact({
        ...element.movement,
        targetEvolution: target,
        ...compact({ newLabel: opts.newLabel, method: opts.method }),
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

  /** Sets market/ecosystem (mutually exclusive) or removes both (`undefined`). */
  setMarketEcosystem(element: WardleyShape, kind: 'market' | 'ecosystem' | undefined): void {
    const dec: Record<string, unknown> = { ...(element.decorators ?? {}) };
    delete dec['market'];
    delete dec['ecosystem'];
    if (kind) dec[kind] = true;
    this.updateProperties(element, { decorators: Object.keys(dec).length ? dec : undefined });
  }

  /** Sets the element color (CSS color/hex) or removes it (`undefined` = default color). */
  setColor(element: WardleyShape, color: string | undefined): void {
    this.updateProperties(element, { color });
  }
}

function sameSize(a: MapSize | undefined, b: MapSize | undefined): boolean {
  if (!a || !b) return a === b;
  return a.width === b.width && a.height === b.height;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
