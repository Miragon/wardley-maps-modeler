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

/** Eine benannte X-Achsen-Beschriftungsvariante (vier Stage-Labels). */
export interface EvolutionPreset {
  /** Stabile Kennung (Persistenz/UI-Auswahl). */
  readonly id: string;
  /** Menschlich lesbarer Name. */
  readonly name: string;
  /** Die vier Stage-Labels (links -> rechts). */
  readonly labels: readonly [string, string, string, string];
}

/**
 * Vordefinierte X-Achsen-Beschriftungen nach Simon Wardleys "Landscape"-Cheat-Sheet
 * (learnwardleymapping.com/landscape). Je nach Art des Kartierten (Aktivität, Praxis, Daten,
 * Wissen) evolviert die X-Achse unter anderen Begriffen. `activities` entspricht dem Default.
 */
export const EVOLUTION_PRESETS: readonly EvolutionPreset[] = [
  { id: 'activities', name: 'Activities', labels: DEFAULT_EVOLUTION_LABELS },
  { id: 'practices', name: 'Practices', labels: ['Novel', 'Emerging', 'Good', 'Best Practice'] },
  { id: 'data', name: 'Data', labels: ['Unmodelled', 'Divergent', 'Convergent', 'Modelled'] },
  { id: 'knowledge', name: 'Knowledge', labels: ['Concept', 'Hypothesis', 'Theory', 'Accepted'] },
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
