import type { ModuleDeclaration } from 'didi';
import ConnectionPreviewModule from 'diagram-js/lib/features/connection-preview';
import WardleyAppendBehavior from './WardleyAppendBehavior.js';

/**
 * „Komponente anhängen": zieht den `connectionPreview`-Service herein (aktiviert damit zugleich die
 * Pfeil-Vorschau des Connect-Werkzeugs) und registriert die Append-Behavior (Live-Pfeil-Vorschau +
 * automatisches Öffnen des Label-Editors nach dem Anlegen).
 */
export const wardleyAppendModule: ModuleDeclaration = {
  __depends__: [ConnectionPreviewModule],
  __init__: ['wardleyAppendBehavior'],
  wardleyAppendBehavior: ['type', WardleyAppendBehavior],
};

export { default as WardleyAppendBehavior } from './WardleyAppendBehavior.js';
