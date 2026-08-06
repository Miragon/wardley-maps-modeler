/**
 * DOM-boundary enforcement at the module-graph level (concept doc §9.1, P1).
 * Complements the ESLint rule: forbids DOM-free packages from depending on diagram-js /
 * DOM libraries or on the DOM-dependent @miragon/wardley-renderer.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'dom-free-no-diagram-js',
      comment: 'DOM-free packages must not import diagram-js / DOM libraries (P1).',
      severity: 'error',
      from: { path: '^packages/(schema-model|dsl|transforms)/src' },
      to: { path: 'node_modules/(diagram-js|tiny-svg|min-dom)' },
    },
    {
      name: 'schema-model-is-base',
      comment: 'schema-model is the metamodel base layer and must not depend on any other internal package.',
      severity: 'error',
      from: { path: '^packages/schema-model/src' },
      to: { path: '^packages/(?!schema-model)[^/]+/src' },
    },
    {
      name: 'core-siblings-independent',
      comment:
        'dsl and transforms may only depend on schema-model internally — not on each other, not on renderer.',
      severity: 'error',
      from: { path: '^packages/(dsl|transforms)/src' },
      to: { path: '^packages/(?!schema-model)[^/]+/src', pathNot: ['^packages/$1/src'] },
    },
    {
      name: 'zod-only-in-schema-model',
      comment:
        'Zod validation is owned by schema-model; other packages consume validated types, not zod.',
      severity: 'error',
      from: { path: '^packages/(dsl|transforms|renderer)/src' },
      to: { path: 'node_modules/zod' },
    },
    {
      name: 'dom-free-no-renderer',
      comment: 'DOM-free packages must not depend on the DOM-dependent renderer.',
      severity: 'error',
      from: { path: '^packages/(schema-model|dsl|transforms)/src' },
      to: { path: '^packages/renderer/src' },
    },
    {
      name: 'renderer-feature-encapsulation',
      comment:
        'Within the renderer, a feature folder may reach into another feature only through the shared ' +
        'core (model/di-types, draw styles/icons, theme) or that feature public index.ts. New runtime ' +
        'coupling into a sibling feature internals is forbidden (type-only DI wiring is exempt).',
      severity: 'error',
      from: { path: '^packages/renderer/src/([^/]+)/' },
      to: {
        path: '^packages/renderer/src/[^/]+/',
        dependencyTypesNot: ['type-only'],
        pathNot: [
          '^packages/renderer/src/$1/',
          '^packages/renderer/src/[^/]+/index\\.ts$',
          '^packages/renderer/src/model/di-types\\.ts$',
          '^packages/renderer/src/draw/(styles|icons|palette-icons)\\.ts$',
          '^packages/renderer/src/theme/',
        ],
      },
    },
    {
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'No broken imports.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-dev-dep-in-src',
      comment: 'Production source must not import devDependencies.',
      severity: 'error',
      from: { path: '^packages/[^/]+/src', pathNot: '\\.(test|spec)\\.ts$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-orphans',
      comment:
        'Dead source modules (unimported, not an entrypoint). Scoped to package src — build ' +
        'artifacts and standalone published barrels (e.g. transforms) are not orphans.',
      severity: 'error',
      from: { orphan: true, path: '^packages/[^/]+/src', pathNot: ['\\.d\\.ts$', '/index\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
