import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTE_COLORS } from '../src/draw/styles.js';

/**
 * Drift guard: the Claude Code plugin teaches Claude which colour to give a review note, and Claude
 * writes those hex values straight into the user's map. If the skills quote stale hexes (as the
 * first skill version did), Claude's notes no longer match the editor's note palette and its
 * colour picker. `NOTE_COLORS` in `draw/styles.ts` is the source of truth.
 */
const pluginRoot = fileURLToPath(
  new URL('../../../plugins/wardley-maps-modeler/', import.meta.url),
);

const COLOR_LEGEND_FILES = [
  'skills/wardley-mapping/SKILL.md',
  'skills/owm-dsl/reference/layout.md',
];
const MEANING_COLOR_IDS = ['green', 'amber', 'red', 'blue', 'purple'] as const;
const MINIMUM_LEGEND_COLORS = 4;

const NOTE_KEYWORD = /^\s*note\s/i;
const NOTE_COORDINATES = /\[\s*[-\d.]+\s*,\s*[-\d.]+\s*\]/;
const NOTE_COLOR_SUFFIX = /\(\s*color\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z][\w-]*)\s*\)/gi;
const INLINE_CODE_SPAN = /`([^`\n]+)`/g;
const PROSE_NOTE_COLOR = /\bnote\s[^\n[]*\[[^\]\n]*\][^\n(]*\(\s*color\s+([#\w-]+)\s*\)/gi;

type NoteColor = (typeof NOTE_COLORS)[number];

interface NoteColorUsage {
  readonly color: string;
  readonly location: string;
}

interface LegendRow {
  readonly row: string;
  readonly namedColors: readonly NoteColor[];
  readonly hexes: readonly string[];
}

const PALETTE_HEXES = new Set(NOTE_COLORS.map((color) => normalizeHex(color.value)));

function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

function readPluginFile(relativePath: string): string {
  const filePath = join(pluginRoot, relativePath);
  expect(existsSync(filePath), `${relativePath} exists in the plugin`).toBe(true);
  return readFileSync(filePath, 'utf8');
}

/**
 * A legend row is a markdown table row that names a palette colour (by `NOTE_COLORS` id) and
 * carries a hex token, whatever the column order. Only tables naming several palette colours count
 * as the note legend, so a small table about other canvas colours (attitudes, say) is not misread
 * as one. Tokens of 3–8 digits are captured so `#RGB`/`#RRGGBBAA` cannot slip past the check.
 */
function readLegendRows(markdown: string): LegendRow[] {
  const tables: string[][] = [[]];
  for (const line of markdown.split(/\r?\n/)) {
    if (line.trim().startsWith('|')) tables[tables.length - 1]!.push(line.trim());
    else if (tables[tables.length - 1]!.length > 0) tables.push([]);
  }
  return tables.flatMap((table) => {
    const rows = table
      .map((row) => ({
        row,
        namedColors: NOTE_COLORS.filter((color) => new RegExp(`\\b${color.id}\\b`, 'i').test(row)),
        hexes: [...row.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => normalizeHex(match[0])),
      }))
      .filter((legendRow) => legendRow.namedColors.length > 0 && legendRow.hexes.length > 0);
    const distinctColors = new Set(rows.flatMap((legendRow) => legendRow.namedColors));
    return distinctColors.size >= MINIMUM_LEGEND_COLORS ? rows : [];
  });
}

function listNoteSources(): string[] {
  const pluginFiles = readdirSync(pluginRoot, { recursive: true, encoding: 'utf8' }).filter(
    (relativePath) => /\.(md|wmap|owm)$/.test(relativePath),
  );
  return [...new Set([...COLOR_LEGEND_FILES, ...pluginFiles])].sort();
}

/**
 * The parser reads a note's `(color …)` only after the coordinates, but this check scans the whole
 * statement (any line or inline code span that starts with `note` and carries a `[v, e]` tuple),
 * so a colour written in the wrong place is still held to the palette. Prose that merely mentions
 * a note keeps the stricter note-tuple-colour order so ordinary sentences are not misread as
 * statements.
 */
function readNoteColors(source: string): NoteColorUsage[] {
  return source.split(/\r?\n/).flatMap((line, index) => {
    const statements = [line, ...[...line.matchAll(INLINE_CODE_SPAN)].map((span) => span[1]!)]
      .filter((candidate) => NOTE_KEYWORD.test(candidate) && NOTE_COORDINATES.test(candidate))
      .flatMap((statement) => [...statement.matchAll(NOTE_COLOR_SUFFIX)].map((match) => match[1]!));
    const proseMentions = [...line.matchAll(PROSE_NOTE_COLOR)].map((match) => match[1]!);
    return [...new Set([...statements, ...proseMentions])].map((color) => ({
      color,
      location: `line ${index + 1}: ${line.trim()}`,
    }));
  });
}

describe('skill-note-colors.sync — the plugin quotes the editor note palette', () => {
  it.each(COLOR_LEGEND_FILES)(
    '%s: every legend hex is the NOTE_COLORS value of its colour',
    (file) => {
      const rows = readLegendRows(readPluginFile(file));
      expect(rows.length, `${file} has a note colour legend table`).toBeGreaterThan(0);
      const mismatches = rows.flatMap(({ row, namedColors, hexes }) => {
        const allowedHexes = namedColors.map((color) => normalizeHex(color.value));
        return hexes.filter((hex) => !allowedHexes.includes(hex)).map((hex) => `${hex} in ${row}`);
      });
      expect(mismatches).toEqual([]);
    },
  );

  it.each(COLOR_LEGEND_FILES)('%s: lists every meaning colour with its exact hex', (file) => {
    const rows = readLegendRows(readPluginFile(file));
    const missing = MEANING_COLOR_IDS.map((id) =>
      NOTE_COLORS.find((candidate) => candidate.id === id)!,
    )
      .filter(
        (color) =>
          !rows.some(
            ({ namedColors, hexes }) =>
              namedColors.includes(color) && hexes.includes(normalizeHex(color.value)),
          ),
      )
      .map((color) => `${color.name} ${color.value}`);
    expect(missing).toEqual([]);
  });

  it('every note colour anywhere in the plugin is a NOTE_COLORS hex', () => {
    const sources = listNoteSources();
    expect(sources).toContain('README.md');
    const offPalette = sources.flatMap((file) =>
      readNoteColors(readPluginFile(file))
        .filter(({ color }) => !PALETTE_HEXES.has(normalizeHex(color)))
        .map(({ color, location }) => `${file} ${location} → ${color}`),
    );
    expect(offPalette).toEqual([]);
  });
});
