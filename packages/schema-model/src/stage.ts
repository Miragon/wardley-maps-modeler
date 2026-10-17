/** Evolution stage derivation (pure function, no persistence; concept doc §2.2 / P2). */

export type EvolutionStage = 0 | 1 | 2 | 3;

/** Default stage boundaries (Genesis|Custom, Custom|Product, Product|Commodity). */
export const DEFAULT_STAGE_BOUNDARIES: readonly [number, number, number] = [0.17, 0.4, 0.7];

export const DEFAULT_EVOLUTION_LABELS: readonly [string, string, string, string] = [
  'Genesis',
  'Custom-Built',
  'Product / Rental',
  'Commodity / Utility',
];

/**
 * The X-axis labels to store: an empty stage falls back to its default (an empty label cannot be
 * written in the `->`-separated `evolution` line), a typed `->` becomes an arrow so it cannot add
 * a fifth stage, and the default set is stored as no labels at all (no `evolution` line).
 */
export function normalizeEvolutionLabels(
  values: readonly string[] | undefined,
): readonly [string, string, string, string] | undefined {
  if (!values) return undefined;
  const labels = DEFAULT_EVOLUTION_LABELS.map((fallback, index) => {
    const value = (values[index] ?? '').replace(/->/g, '→').trim();
    return value || fallback;
  }) as unknown as readonly [string, string, string, string];
  return sameEvolutionLabels(labels, DEFAULT_EVOLUTION_LABELS) ? undefined : labels;
}

/** Whether two label sets are equal; `undefined` (the default set) only equals itself. */
export function sameEvolutionLabels(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((label, index) => label === b[index]);
}

export interface EvolutionPreset {
  /** Stable identifier (persistence/UI selection). */
  readonly id: string;
  readonly name: string;
  /** The four stage labels (left -> right). */
  readonly labels: readonly [string, string, string, string];
}

/**
 * Predefined X-axis labels from Simon Wardley's "Landscape" cheat sheet
 * (learnwardleymapping.com/landscape). Depending on what is being mapped (activity, practice,
 * data, knowledge), the X-axis evolves under different terms. `activities` matches the default.
 */
export const EVOLUTION_PRESETS: readonly EvolutionPreset[] = [
  { id: 'activities', name: 'Activities', labels: DEFAULT_EVOLUTION_LABELS },
  { id: 'practices', name: 'Practices', labels: ['Novel', 'Emerging', 'Good', 'Best Practice'] },
  { id: 'data', name: 'Data', labels: ['Unmodelled', 'Divergent', 'Convergent', 'Modelled'] },
  { id: 'knowledge', name: 'Knowledge', labels: ['Concept', 'Hypothesis', 'Theory', 'Accepted'] },
];

/**
 * @param evolution normalized in [0, 1]
 * @param boundaries ascending thresholds [g, c, p]
 */
export function evolutionStage(
  evolution: number,
  boundaries: readonly [number, number, number] = DEFAULT_STAGE_BOUNDARIES,
): EvolutionStage {
  const [g, c, p] = boundaries;
  if (evolution < g) return 0;
  if (evolution < c) return 1;
  if (evolution < p) return 2;
  return 3;
}
