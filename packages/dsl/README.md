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

### Writing edits back into hand-written text

`serializeDSL` writes the canonical form: statements grouped by kind, comments and unknown lines at
the end, numbers like `0.80` as `0.8`. Where the text file is the source of truth (an editor, a
file under Git), write an edited map back with `patchDSL` instead:

```ts
import { parseDSL, patchDSL } from '@miragon/wardley-dsl';

const map = parseDSL(fileText);
// … the user moves, renames, adds or deletes something …
const newText = patchDSL(fileText, editedMap);
```

`patchDSL(originalText, map)` keeps every line the edit did not touch exactly as written (comments,
blank lines, line order, number formatting, unknown lines, CRLF or LF line breaks and the final line
break). It rewrites changed statements in place, deletes removed ones together with their links and
evolve lines, rewrites every line that references a renamed element and inserts new statements after
the last statement of the same kind. Elements are matched to the source by id, then by name, so the
element order and ids of `map` do not matter.

The result always reads back as the same map as `serializeDSL(map)`. When an edit cannot be patched
safely into the source layout, `patchDSL` falls back to the canonical `serializeDSL(map)` text (in
the source's line break style). It never throws.

### Ids in the document

The OWM DSL writes no ids: the parser derives them from names (`cmp_cup_of_tea`), note texts and
annotation numbers, with a `_2` suffix for a repeat in line order. An editor that creates or renames
an element holds an id the text does not give it until the text is read again. `readBackIds(map)`
tells, by the ids of `map`, which id each element carries once `serializeDSL(map)` is read back:

```ts
import { readBackIds } from '@miragon/wardley-dsl';

readBackIds(editedMap).get('shape_42'); // 'cmp_hot_water'
```

Part of the [Wardley Maps](https://github.com/Miragon/wardley-maps-modeler) monorepo.

## License

MIT
