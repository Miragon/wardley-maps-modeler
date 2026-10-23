import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  formatVsCodeSmoke,
  runVsCodeSmoke,
  type VsCodeSmokeContext,
} from '@miragon/modeler-shell/testing/vscode-electron';
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import type { WardleyMap } from '@miragon/wardley-schema-model';
import { WEBVIEW_THEMES } from '../../src/themes.js';

const APP_DIRECTORY = fileURLToPath(new URL('../../', import.meta.url));
const SCREENSHOT_DIRECTORY = fileURLToPath(
  new URL('../../../../test-results/vscode-smoke/', import.meta.url),
);
const FIXTURE_FILE_NAME = 'tea-shop.wmap';
const EVOLVED_COMPONENT_ID = 'cmp_kettle';

const runFile = promisify(execFile);

/**
 * The extension as the Marketplace gets it: `vsce package` runs vscode:prepublish (the production
 * bundles) and leaves out what .vscodeignore lists.
 */
async function packExtension(into: string): Promise<string> {
  const vsix = join(into, 'wardley-mapping-modeler.vsix');
  const vsce = createRequire(import.meta.url).resolve('@vscode/vsce/vsce');
  await runFile(process.execPath, [vsce, 'package', '--no-dependencies', '--out', vsix], {
    cwd: APP_DIRECTORY,
  });
  return vsix;
}

/**
 * Unpacked outside the repository, no node_modules of the monorepo sits next to the bundle, so a
 * module esbuild did not inline fails the activation here as it would for a user.
 */
async function unpackExtension(vsix: string, into: string): Promise<string> {
  await runFile('unzip', ['-q', vsix, 'extension/*', '-d', into]);
  return join(into, 'extension');
}

/**
 * An empty text parses without a diagnostic, yet no save of the fixture is empty: rejecting it
 * makes the driver's save step read the file again instead of passing a write it caught halfway.
 */
function parseMap(text: string): WardleyMap {
  const { map, diagnostics } = parseDSLWithDiagnostics(text);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(({ line, message }) => `line ${line}: ${message}`).join('; '));
  }
  if (map.elements.length === 0) throw new Error('the map has no elements');
  return map;
}

function evolutionOf(map: WardleyMap, elementId: string): number {
  const element = map.elements.find(({ id }) => id === elementId);
  if (!element) throw new Error(`The map has no element ${elementId}.`);
  return element.position.evolution;
}

/**
 * The everyday Wardley edit: select a component and evolve it one coarse step to the right. Then
 * Escape and a pointer on the empty plot beside it, so neither its context pad nor its hover
 * outline is in the theme screenshots.
 */
async function evolveComponent({ webview, page, timeoutMs }: VsCodeSmokeContext): Promise<void> {
  const shape = `.djs-shape[data-element-id="${EVOLVED_COMPONENT_ID}"]`;
  const hitArea = webview.locator(`${shape} > .djs-hit`);
  await hitArea.click({ timeout: timeoutMs });
  await webview.locator(`${shape}.selected`).waitFor({ timeout: timeoutMs });
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Escape');
  await webview.locator(`${shape}.selected`).waitFor({ state: 'detached', timeout: timeoutMs });
  const box = await hitArea.boundingBox();
  if (box) await page.mouse.move(box.x - 60, box.y + box.height / 2);
}

let workDirectory: string | undefined;
let extensionPath = '';

beforeAll(async () => {
  await rm(SCREENSHOT_DIRECTORY, { recursive: true, force: true });
  workDirectory = await mkdtemp(join(tmpdir(), 'wardley-vscode-smoke-'));
  // The release passes the VSIX it is about to publish, so the smoke checks that very file.
  const prebuiltVsix = process.env.VSCODE_SMOKE_VSIX;
  const vsix = prebuiltVsix ? resolve(prebuiltVsix) : await packExtension(workDirectory);
  extensionPath = await unpackExtension(vsix, workDirectory);
}, 300_000);

afterAll(async () => {
  if (workDirectory) await rm(workDirectory, { recursive: true, force: true });
});

// The first run downloads VS Code (about 350 MB) into the OS cache directory; later runs reuse it.
it(
  'opens, edits, saves, undoes and themes a map in a real VS Code',
  { timeout: 600_000 },
  async () => {
    const fixtureText = await readFile(new URL(FIXTURE_FILE_NAME, import.meta.url), 'utf8');
    const evolutionBefore = evolutionOf(parseMap(fixtureText), EVOLVED_COMPONENT_ID);

    const result = await runVsCodeSmoke({
      extensionPath,
      fixture: { fileName: FIXTURE_FILE_NAME, text: fixtureText },
      parse: parseMap,
      edit: evolveComponent,
      themes: WEBVIEW_THEMES,
      name: 'wardley',
      screenshotDir: SCREENSHOT_DIRECTORY,
      vscodeVersion: process.env.VSCODE_VERSION || undefined,
      keepTemporaryFiles: process.env.VSCODE_SMOKE_KEEP === '1',
      log: (line) => console.log(line),
    });
    console.log(formatVsCodeSmoke(result));

    expect(result.failures, result.failures.join('\n')).toEqual([]);
    const saved = result.saved?.parsed as WardleyMap;
    expect(evolutionOf(saved, EVOLVED_COMPONENT_ID)).toBeGreaterThan(evolutionBefore);
  },
);
