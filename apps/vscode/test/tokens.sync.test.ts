import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHELL, SHELL_TOKENS, shellSizesFromTokens } from '@miragon/modeler-shell/core';

const tokens = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../packages/renderer/src/theme/cd-tokens.generated.json', import.meta.url),
    ),
    'utf8',
  ),
) as { shell: Record<string, string> };

// The shell's fit and layout compute with SHELL, its stylesheet reads the vendored --cd-shell-*
// tokens: both must be the same sizes.
describe('the shell sizes equal the vendored design-system tokens', () => {
  it('SHELL is the `shell` group of cd-tokens.generated.json', () => {
    expect(SHELL).toEqual(shellSizesFromTokens(tokens.shell));
  });

  it('every token the shell names is vendored', () => {
    expect(Object.keys(tokens.shell)).toEqual(expect.arrayContaining(Object.values(SHELL_TOKENS)));
  });
});
