/**
 * Schema-Migrationen als geordnete Kette reiner Funktionen (Konzept §7.2).
 * `migrate(json)` liest `schemaVersion`, wendet alle noetigen Schritte an und gibt das
 * auf die aktuelle Version angehobene (noch unvalidierte) Objekt zurueck.
 */

export const CURRENT_SCHEMA_VERSION = 1;

type Json = Record<string, unknown>;

/** Migration von Version N auf N+1. Index 0 = (v1 -> v2) usw. */
const MIGRATIONS: ReadonlyArray<(json: Json) => Json> = [
  // Noch keine Migrationen — v1 ist die Startversion.
];

export function migrate(input: unknown): Json {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WardleyMap muss ein Objekt sein.');
  }
  const obj = { ...(input as Json) };
  const rawVersion = obj['schemaVersion'];
  const version = typeof rawVersion === 'number' ? rawVersion : 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unbekannte schemaVersion ${version} (unterstuetzt bis ${CURRENT_SCHEMA_VERSION}). ` +
        'Bitte das Tool aktualisieren.',
    );
  }
  if (version < 1) {
    throw new Error(`Ungueltige schemaVersion ${version}.`);
  }

  let current: Json = { ...obj, schemaVersion: version };
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v - 1];
    if (!step) throw new Error(`Fehlende Migration fuer Version ${v}.`);
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return current;
}
