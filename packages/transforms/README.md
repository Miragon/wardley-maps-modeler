# @miragon/wardley-transforms

[![npm](https://img.shields.io/npm/v/@miragon/wardley-transforms)](https://www.npmjs.com/package/@miragon/wardley-transforms)
[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)

DOM-free, pure `WardleyMap → WardleyMap` transforms — evolve, method, inertia, pipeline. No undo
stack: every transform returns a new map and leaves the input untouched.

## Install

```bash
npm install @miragon/wardley-transforms
```

## Usage

```ts
import { parseDSL } from '@miragon/wardley-dsl';
import { evolveComponent } from '@miragon/wardley-transforms';

const map = parseDSL('component Kettle [0.43, 0.35]');
const [kettle] = map.elements;

const evolved = evolveComponent(map, kettle.id, 0.62); // returns a new map
```

Part of the [Wardley Maps](https://github.com/Miragon/wardley-maps-modeler) monorepo.

## License

MIT
