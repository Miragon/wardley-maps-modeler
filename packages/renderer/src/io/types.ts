import type { MapConfig } from '@wardley/schema-model';

/** ID des diagram-js-Root-Elements der Wardley-Map. */
export const ROOT_ID = 'wardley-root';

export interface ImportWarning {
  readonly message: string;
  readonly elementId?: string;
}

/** Auf dem Root-Element hinterlegte Map-Metadaten (Konfig + verlustfreier Passthrough). */
export interface RootBusinessObject {
  readonly config: MapConfig;
  readonly rawPassthrough?: readonly string[];
}
