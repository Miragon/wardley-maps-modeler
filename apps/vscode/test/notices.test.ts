import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/third-party-notices.mjs', import.meta.url));

// The VSIX bundles Lucide and Material icons, the Geist fonts and every npm package esbuild pulls
// in; their licenses must ship with it, so a dependency added or bumped without regenerating fails.
describe('THIRD_PARTY_NOTICES.md', () => {
  it('lists the license of everything the bundles contain', async () => {
    await expect(promisify(execFile)(process.execPath, [script, '--check'])).resolves.toBeDefined();
  }, 60_000);
});
