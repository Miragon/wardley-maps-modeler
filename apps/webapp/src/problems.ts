import type { ProblemItem } from '@miragon/modeler-shell';
import type { ImportWarning } from '@miragon/wardley-renderer';
import { describeWarning } from './map-file.js';

/** "Line 12 · A -> Nowhere": the line, and what stands on it. */
function lineLocation(line: number, source: string | undefined): string {
  const text = source?.trim();
  return text ? `Line ${line} · ${text}` : `Line ${line}`;
}

/**
 * Import warnings as rows of the problems list (guide §5.10): the message, its line and source
 * below it. No row selects an element: the only finding naming one is an edge with a missing
 * endpoint, which the map never draws.
 */
export function problemItems(warnings: readonly ImportWarning[]): ProblemItem[] {
  return warnings.map((warning) => {
    const row = describeWarning(warning);
    return {
      severity: 'warning',
      message: row.message,
      ...(row.line === undefined ? {} : { location: lineLocation(row.line, row.source) }),
    };
  });
}

/** The toast after an import with warnings points at the pill (guide §9). */
export function importWarningsText(count: number, pillLabel: string): string {
  const warnings = count === 1 ? '1 warning' : `${count} warnings`;
  return `Imported with ${warnings}. Details under “${pillLabel}” bottom left.`;
}
