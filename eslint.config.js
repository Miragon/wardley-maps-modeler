// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
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
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/check-alignment': 'error',
      'jsdoc/multiline-blocks': 'error',
      'jsdoc/no-multi-asterisks': 'error',
    },
  },
  {
    // Intra-module clean-code ratchet: caps set just above today's maxima, so they are green now and
    // can only be tightened. Source only — tests/config have naturally long describe/setup blocks.
    // max-params is intentionally omitted: diagram-js DI injects each service as a constructor
    // parameter, so a high count is the framework idiom, not a smell.
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    rules: {
      complexity: ['error', 40],
      'max-depth': ['error', 6],
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Grandfathered tech-debt: the hand-written OWM parser/serializer predate the caps and exceed
    // them. Ceilings pin them at today's size so they cannot grow; splitting them is tracked debt.
    files: ['packages/dsl/src/parser.ts', 'packages/dsl/src/serializer.ts'],
    rules: {
      complexity: ['error', 130],
      'max-lines-per-function': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['packages/renderer/**/*.ts', 'apps/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
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
  {
    files: ['**/*.{test,spec}.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
