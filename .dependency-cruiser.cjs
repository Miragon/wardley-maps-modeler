/**
 * DOM-Boundary-Enforcement auf Modulgraph-Ebene (Konzept §9.1, P1).
 * Ergaenzt die ESLint-Regel: verbietet, dass DOM-freie Pakete von diagram-js /
 * DOM-Bibliotheken oder vom DOM-abhaengigen @wardley/renderer abhaengen.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'dom-free-no-diagram-js',
      comment: 'DOM-freie Pakete duerfen diagram-js / DOM-Libs nicht importieren (P1).',
      severity: 'error',
      from: { path: '^packages/(schema-model|dsl|transforms)/src' },
      to: { path: 'node_modules/(diagram-js|tiny-svg|min-dom)' },
    },
    {
      name: 'dom-free-no-renderer',
      comment: 'DOM-freie Pakete duerfen nicht vom DOM-abhaengigen renderer abhaengen.',
      severity: 'error',
      from: { path: '^packages/(schema-model|dsl|transforms)/src' },
      to: { path: '^packages/renderer/src' },
    },
    {
      name: 'no-circular',
      comment: 'Keine zyklischen Abhaengigkeiten.',
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
