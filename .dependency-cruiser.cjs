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
      name: 'dom-free-no-renderer',
      comment: 'DOM-free packages must not depend on the DOM-dependent renderer.',
      severity: 'error',
      from: { path: '^packages/(schema-model|dsl|transforms)/src' },
      to: { path: '^packages/renderer/src' },
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
