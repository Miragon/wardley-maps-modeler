import type { MapConfig } from '@miragon/wardley-schema-model';

/** ID of the diagram-js root element of the Wardley map. */
export const ROOT_ID = 'wardley-root';

export interface ImportWarning {
  readonly message: string;
  readonly elementId?: string;
}

/** Map metadata stored on the root element (config + lossless passthrough). */
export interface RootBusinessObject {
  readonly config: MapConfig;
  readonly rawPassthrough?: readonly string[];
}
