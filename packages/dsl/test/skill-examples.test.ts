import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDSL, parseDSLWithDiagnostics, serializeDSL } from '../src/index.js';

/**
 * Drift guard for the Claude Code plugin: Claude copies the skills' ```owm examples and the
 * shipped .wmap files verbatim into maps the Wardley Maps Modeler then renders. A snippet the
 * parser rejects, silently drops or rewrites would teach Claude broken syntax, so every example
 * must parse cleanly and survive a serialize round-trip unchanged.
 */
const pluginRoot = fileURLToPath(
  new URL('../../../plugins/wardley-maps-modeler/', import.meta.url),
);

interface MapExample {
  readonly name: string;
  readonly text: string;
}

function listPluginFiles(extensionPattern: RegExp): string[] {
  if (!existsSync(pluginRoot)) return [];
  return readdirSync(pluginRoot, { recursive: true, encoding: 'utf8' })
    .filter((relativePath) => extensionPattern.test(relativePath))
    .map((relativePath) => join(pluginRoot, relativePath))
    .sort();
}

function describeExample(filePath: string, location: string, text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim() !== '') ?? '(empty)';
  return `${relative(pluginRoot, filePath)}${location} — ${firstLine.trim().slice(0, 60)}`;
}

/**
 * Follows the CommonMark fence rules (same fence character, closing run at least as long as the
 * opening one) so an ```owm sample nested inside a longer ````markdown fence stays documentation
 * and is not mistaken for a real example.
 */
function extractOwmFences(markdown: string): { startLine: number; text: string }[] {
  const blocks: { startLine: number; text: string }[] = [];
  const lines = markdown.split(/\r?\n/);
  let openFence: { marker: string; indent: number; isOwm: boolean; startLine: number } | null =
    null;
  let body: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (openFence === null) {
      const opening = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
      if (!opening) continue;
      const [, indent = '', marker = '', infoString = ''] = opening;
      if (marker.startsWith('`') && infoString.includes('`')) continue;
      openFence = {
        marker,
        indent: indent.length,
        isOwm: infoString.trim() === 'owm',
        startLine: index + 1,
      };
      body = [];
      continue;
    }
    const closing = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    const closingMarker = closing?.[1];
    if (
      closingMarker !== undefined &&
      closingMarker[0] === openFence.marker[0] &&
      closingMarker.length >= openFence.marker.length
    ) {
      if (openFence.isOwm) blocks.push({ startLine: openFence.startLine, text: body.join('\n') });
      openFence = null;
      continue;
    }
    const removableIndent = /^\s*/.exec(line)![0].length;
    body.push(line.slice(Math.min(removableIndent, openFence.indent)));
  }
  if (openFence?.isOwm) blocks.push({ startLine: openFence.startLine, text: body.join('\n') });
  return blocks;
}

function collectMarkdownExamples(): MapExample[] {
  return listPluginFiles(/\.md$/).flatMap((filePath) =>
    extractOwmFences(readFileSync(filePath, 'utf8')).map((block, blockIndex) => ({
      name: describeExample(filePath, `:${block.startLine} block ${blockIndex + 1}`, block.text),
      text: block.text,
    })),
  );
}

function collectMapFiles(): MapExample[] {
  return listPluginFiles(/\.(wmap|owm)$/).map((filePath) => {
    const text = readFileSync(filePath, 'utf8');
    return { name: describeExample(filePath, '', text), text };
  });
}

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
