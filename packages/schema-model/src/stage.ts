/** Evolution-Stage-Ableitung (reine Funktion, keine Persistenz; Konzept §2.2 / P2). */

export type EvolutionStage = 0 | 1 | 2 | 3;

/** Default-Stage-Grenzen (Genesis|Custom, Custom|Product, Product|Commodity). */
export const DEFAULT_STAGE_BOUNDARIES: readonly [number, number, number] = [0.17, 0.4, 0.7];

/** Default-Achsenbeschriftung der vier Evolution-Stages. */
export const DEFAULT_EVOLUTION_LABELS: readonly [string, string, string, string] = [
  'Genesis',
  'Custom-Built',
  'Product / Rental',
  'Commodity / Utility',
];

/**
 * Leitet die diskrete Evolution-Stage (0..3) aus dem kontinuierlichen Evolution-Wert ab.
 *
 * @param evolution normiert in [0, 1]
 * @param boundaries aufsteigende Schwellen [g, c, p]
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
