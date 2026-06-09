# @miragon/wardley-dsl

[![npm](https://img.shields.io/npm/v/@miragon/wardley-dsl)](https://www.npmjs.com/package/@miragon/wardley-dsl)
[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)

DOM-free bridge between the [Online-Wardley-Maps](https://docs.onlinewardleymaps.com/) text DSL and
the `WardleyMap` model — a lossless round-trip.

## Install

```bash
npm install @miragon/wardley-dsl
```

## Usage

```ts
import { parseDSL, serializeDSL } from '@miragon/wardley-dsl';

const map = parseDSL(`title Tea Shop
component Kettle [0.43, 0.35]
evolve Kettle 0.62`);

const text = serializeDSL(map); // back to OWM text, losslessly
```

Part of the [Wardley Maps](https://github.com/Miragon/wardley-maps-modeler) monorepo.

## License

MIT
