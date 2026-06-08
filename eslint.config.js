// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Flat Config. The most important project-specific piece is DOM-boundary enforcement:
 * the DOM-free packages (schema-model, dsl, transforms) must not import diagram-js or any
 * DOM library/global (guiding principle P1, concept doc §9.1).
 */

const DOM_RESTRICTED_IMPORTS = {
  paths: [
    { name: 'diagram-js', message: 'DOM-free packages must not import diagram-js (P1).' },
    { name: 'tiny-svg', message: 'DOM-free packages must not import tiny-svg (P1).' },
    { name: 'min-dom', message: 'DOM-free packages must not import min-dom (P1).' },
  ],
  patterns: [
    {
      group: ['diagram-js/*'],
      message: 'DOM-free packages must not import diagram-js (P1).',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'eslint.config.js',
      '**/*.config.{js,ts,mjs,cjs}',
      '.dependency-cruiser.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  // DOM-dependent packages/apps: browser globals allowed.
  {
    files: ['packages/renderer/**/*.ts', 'apps/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // DOM-FREE packages: hard boundary.
  {
    files: ['packages/schema-model/**/*.ts', 'packages/dsl/**/*.ts', 'packages/transforms/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-restricted-imports': ['error', DOM_RESTRICTED_IMPORTS],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'DOM-free package: no window (P1).' },
        { name: 'document', message: 'DOM-free package: no document (P1).' },
      ],
    },
  },
  // Tests may be more lenient.
  {
    files: ['**/*.{test,spec}.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
