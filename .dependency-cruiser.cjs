/**
 * DOM-boundary enforcement at the module-graph level (concept doc §9.1, P1).
 * Complements the ESLint rule: forbids DOM-free packages from depending on diagram-js /
 * DOM libraries or on the DOM-dependent @miragon/wardley-renderer, and keeps the shared modeler
 * chrome (@miragon/modeler-shell) out of every package.
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
      name: 'dom-free-no-renderer',
      comment: 'DOM-free packages must not depend on the DOM-dependent renderer.',
      severity: 'error',
      from: { path: '^packages/(schema-model|dsl|transforms)/src' },
      to: { path: '^packages/renderer/src' },
    },
    {
      name: 'packages-no-shell',
      comment:
        'The renderer and the DOM-free packages never import @miragon/modeler-shell; only the apps ' +
        'mount the shell (dependency direction of Miragon/modeler-api#4).',
      severity: 'error',
      from: { path: '^packages/[^/]+/src' },
      // Matches the specifier too, so an import that does not resolve from the package fails.
      to: { path: '@miragon/modeler-shell' },
    },
    {
      name: 'dom-free-contract-types-only',
      comment: 'DOM-free packages take only types from @miragon/modeler-api, never runtime code.',
      severity: 'error',
      from: { path: '^packages/(schema-model|dsl|transforms)/src' },
      to: { path: '@miragon/modeler-api', dependencyTypesNot: ['type-only'] },
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
