# @miragon/wardley-schema-model

[![npm](https://img.shields.io/npm/v/@miragon/wardley-schema-model)](https://www.npmjs.com/package/@miragon/wardley-schema-model)
[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)

DOM-free Wardley metamodel: types, Zod validation, stage derivation, and deterministic JSON
serialization.

## Install

```bash
npm install @miragon/wardley-schema-model
```

## Usage

```ts
import { createEmptyMap, serializeMap, parseMapJSON } from '@miragon/wardley-schema-model';

const map = createEmptyMap('Tea Shop');

const json = serializeMap(map); // deterministic: stable key order, rounded coordinates
const restored = parseMapJSON(json); // validated + migrated to the current schema
```

Part of the [Wardley Maps](https://github.com/Miragon/wardley-maps-modeler) monorepo.

## License

MIT
