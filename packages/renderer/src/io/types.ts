import type { MapConfig } from '@miragon/wardley-schema-model';

/** ID of the diagram-js root element of the Wardley map. */
export const ROOT_ID = 'wardley-root';

export interface ImportWarning {
  /** Human-readable, already including the line and source text for DSL findings. */
  readonly message: string;
  readonly elementId?: string;
  /** 1-based line of the DSL finding, for listing or jumping to the offending line. */
  readonly line?: number;
  /** The offending DSL source line as written. */
  readonly source?: string;
}

/** Map metadata stored on the root element (config + lossless passthrough). */
export interface RootBusinessObject {
  readonly config: MapConfig;
  readonly rawPassthrough?: readonly string[];
}
