/**
 * Schema migrations as an ordered chain of pure functions (concept doc §7.2).
 * `migrate(json)` reads `schemaVersion`, applies all necessary steps and returns the
 * object raised to the current version (not yet validated).
 */

export const CURRENT_SCHEMA_VERSION = 1;

type Json = Record<string, unknown>;

/** Migration from version N to N+1. Index 0 = (v1 -> v2), etc. */
const MIGRATIONS: ReadonlyArray<(json: Json) => Json> = [
  // No migrations yet — v1 is the starting version.
];

export function migrate(input: unknown): Json {
  if (typeof input !== 'object' || input === null) {
    throw new Error('WardleyMap must be an object.');
  }
  const obj = { ...(input as Json) };
  const rawVersion = obj['schemaVersion'];
  const version = typeof rawVersion === 'number' ? rawVersion : 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unknown schemaVersion ${version} (supported up to ${CURRENT_SCHEMA_VERSION}). ` +
        'Please update the tool.',
    );
  }
  if (version < 1) {
    throw new Error(`Invalid schemaVersion ${version}.`);
  }

  let current: Json = { ...obj, schemaVersion: version };
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v - 1];
    if (!step) throw new Error(`Missing migration for version ${v}.`);
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return current;
}
