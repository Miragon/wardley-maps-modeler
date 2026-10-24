# Wardley Maps Modeler has moved

> [!IMPORTANT]
> This repository is archived and read-only. The Wardley Maps Modeler now lives in the
> [Miragon modeler suite](https://github.com/Miragon/modeler-suite), in
> [`modelers/wardley`](https://github.com/Miragon/modeler-suite/tree/main/modelers/wardley), with its full git history.

Nothing changes for users:

- **npm packages** keep their names and version lines; new releases come from the suite: [`@miragon/wardley-schema-model`](https://www.npmjs.com/package/@miragon/wardley-schema-model), [`@miragon/wardley-dsl`](https://www.npmjs.com/package/@miragon/wardley-dsl), [`@miragon/wardley-transforms`](https://www.npmjs.com/package/@miragon/wardley-transforms), [`@miragon/wardley-renderer`](https://www.npmjs.com/package/@miragon/wardley-renderer).
- **VS Code extension** `miragon-gmbh.wardley-mapping-modeler` stays the same ([Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler), [Open VSX](https://open-vsx.org/extension/miragon-gmbh/wardley-mapping-modeler)).
- **Web app** stays at [wardley-maps.modeler.miragon.io](https://wardley-maps.modeler.miragon.io).
- **Claude Code plugin** `wardley-maps-modeler` keeps its name and skills; it now comes from the suite's
  marketplace, which replaces the `wardley-maps` marketplace of this repository:

  ```text
  /plugin marketplace add Miragon/modeler-suite
  /plugin install wardley-maps-modeler@modeler-suite
  ```

**Issues and pull requests** go to [Miragon/modeler-suite](https://github.com/Miragon/modeler-suite/issues); the open issues of
this repository were moved there. Development, CI and releases are described in the suite's
[README](https://github.com/Miragon/modeler-suite#readme) and [CONTRIBUTING.md](https://github.com/Miragon/modeler-suite/blob/main/CONTRIBUTING.md), the
modeler itself in [`modelers/wardley/README.md`](https://github.com/Miragon/modeler-suite/blob/main/modelers/wardley/README.md).
