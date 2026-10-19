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
 * below it, and the element a click on the row selects where the map still has it.
 */
export function problemItems(
  warnings: readonly ImportWarning[],
  hasElement: (id: string) => boolean,
): ProblemItem[] {
  return warnings.map((warning) => {
    const row = describeWarning(warning);
    const elementId =
      warning.elementId && hasElement(warning.elementId) ? warning.elementId : undefined;
    return {
      severity: 'warning',
      message: row.message,
      ...(row.line === undefined ? {} : { location: lineLocation(row.line, row.source) }),
      ...(elementId ? { elementId } : {}),
    };
  });
}

/** The toast after an import with warnings points at the pill (guide §9). */
export function importWarningsText(count: number, pillLabel: string): string {
  const warnings = count === 1 ? '1 warning' : `${count} warnings`;
  return `Imported with ${warnings}. Details under “${pillLabel}” bottom left.`;
}
