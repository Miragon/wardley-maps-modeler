// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Flat Config. Wichtigster projektspezifischer Baustein: das DOM-Boundary-Enforcement.
 * Die DOM-freien Pakete (schema-model, dsl, transforms) duerfen weder diagram-js noch
 * DOM-Bibliotheken/-Globals importieren (Leitprinzip P1, Konzept §9.1).
 */

const DOM_RESTRICTED_IMPORTS = {
  paths: [
    { name: 'diagram-js', message: 'DOM-freie Pakete duerfen diagram-js nicht importieren (P1).' },
    { name: 'tiny-svg', message: 'DOM-freie Pakete duerfen tiny-svg nicht importieren (P1).' },
    { name: 'min-dom', message: 'DOM-freie Pakete duerfen min-dom nicht importieren (P1).' },
  ],
  patterns: [
    {
      group: ['diagram-js/*'],
      message: 'DOM-freie Pakete duerfen diagram-js nicht importieren (P1).',
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
  // DOM-abhaengige Pakete/Apps: Browser-Globals erlaubt.
  {
    files: ['packages/renderer/**/*.ts', 'apps/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // DOM-FREIE Pakete: harte Grenze.
  {
    files: ['packages/schema-model/**/*.ts', 'packages/dsl/**/*.ts', 'packages/transforms/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-restricted-imports': ['error', DOM_RESTRICTED_IMPORTS],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'DOM-freies Paket: kein window (P1).' },
        { name: 'document', message: 'DOM-freies Paket: kein document (P1).' },
      ],
    },
  },
  // Tests duerfen lockerer sein.
  {
    files: ['**/*.{test,spec}.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
