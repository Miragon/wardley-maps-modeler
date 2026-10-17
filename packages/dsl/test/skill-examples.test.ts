import { describe, it, expect } from 'vitest';
import { parseDSL, parseDSLWithDiagnostics, serializeDSL } from '../src/index.js';
import { collectMapFiles, collectMarkdownExamples, pluginRoot } from './support/plugin-examples.js';

/**
 * Some lines reach `rawPassthrough` without a diagnostic (comments, a url definition no element
 * references), so an empty diagnostics list alone does not prove an example is fully understood.
 * Comments are the only legitimate passthrough content in an example.
 */
function nonCommentPassthrough(text: string): string[] {
  const leftovers: string[] = [];
  let insideBlockComment = false;
  for (const entry of parseDSL(text).rawPassthrough ?? []) {
    const trimmed = entry.trim();
    if (insideBlockComment) {
      if (trimmed.includes('*/')) insideBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*')) {
      insideBlockComment = !trimmed.includes('*/', 2);
      continue;
    }
    leftovers.push(entry);
  }
  return leftovers;
}

function expectCleanRoundTrip(text: string): void {
  expect(parseDSLWithDiagnostics(text).diagnostics).toEqual([]);
  expect(nonCommentPassthrough(text), 'statements the parser did not understand').toEqual([]);
  const serializedOnce = serializeDSL(parseDSL(text));
  expect(serializeDSL(parseDSL(serializedOnce))).toBe(serializedOnce);
}

const markdownExamples = collectMarkdownExamples();
const mapFiles = collectMapFiles();

/**
 * Drift guard for the Claude Code plugin: Claude copies the skills' ```owm examples and the
 * shipped .wmap files verbatim into maps the Wardley Maps Modeler then renders. A snippet the
 * parser rejects, silently drops or rewrites would teach Claude broken syntax, so every example
 * must parse cleanly and survive a serialize round-trip unchanged.
 */
describe('skill examples', () => {
  it('finds at least one ```owm block and one map file (guards against a silently empty suite)', () => {
    expect(markdownExamples.length, `\`\`\`owm blocks under ${pluginRoot}`).toBeGreaterThan(0);
    expect(mapFiles.length, `.wmap/.owm files under ${pluginRoot}`).toBeGreaterThan(0);
  });

  it.each(markdownExamples)('owm block $name', ({ text }) => {
    expectCleanRoundTrip(text);
  });

  it.each(mapFiles)('map file $name', ({ text }) => {
    expectCleanRoundTrip(text);
  });
});
