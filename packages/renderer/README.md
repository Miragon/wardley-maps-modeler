# @miragon/wardley-renderer

[![npm](https://img.shields.io/npm/v/@miragon/wardley-renderer)](https://www.npmjs.com/package/@miragon/wardley-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)

[diagram-js](https://github.com/bpmn-io/diagram-js)-based renderer for
[Wardley Maps](https://learnwardleymapping.com/): `Viewer`, `NavigatedViewer`, and a full editable
`Modeler`, plus OWM / JSON import and OWM / JSON / SVG / PNG export. Browser/DOM only.

## Install

```bash
npm install @miragon/wardley-renderer
```

## Usage

```ts
import { NavigatedViewer } from '@miragon/wardley-renderer';
import '@miragon/wardley-renderer/assets/wardley.css';

const viewer = new NavigatedViewer({ container: document.querySelector('#canvas')! });

await viewer.importDSL(`title Tea Shop
anchor Business [0.95, 0.63]
component Kettle [0.43, 0.35]
evolve Kettle 0.62
Business -> Kettle`);

const map = viewer.exportMap(); // canonical JSON model
const dsl = viewer.exportDSL(); // back to OWM text
const { svg } = await viewer.saveSVG();
```

Swap `NavigatedViewer` for `Modeler` to get the editable map (palette, context pad, undo/redo).

## API

| Member                                                   | What it does                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `importDSL(text)` / `importMap(map)`                     | Loads a map (replaces the content, clears the undo history). Resolves to `{ warnings }`.                          |
| `exportDSL()` / `exportMap()` / `saveSVG()`              | The map as canonical OWM text, as the JSON model, or as a standalone SVG (never shows selection or hover state).  |
| `setTitle(title)`                                        | Sets the map title (one undo step in the `Modeler`).                                                              |
| `getMapSize()`                                           | The plot size as drawn, whether the map writes it (`size [w, h]`) and the matching preset.                        |
| `setMapSize(width, height)` / `resetMapSize()`           | Changes the plot size (rounded and clamped to 480–5000 × 320–5000). In the `Modeler` one undo step, no re-import. |
| `setEvolutionLabels(labels, { transient })`              | Sets the four X-axis stage labels (normalized, see below); `transient` previews without an undo step.             |
| `undo()` / `redo()` / `canUndo()` / `canRedo()`          | `Modeler` only: the canvas command stack.                                                                         |
| `commitPendingEdits()`                                   | `Modeler` only: saves an open inline editor, e.g. before a save shortcut.                                         |
| `on(event, callback)` / `off(event, callback)`           | diagram-js events, see below.                                                                                     |
| `svgToPng(svg, { scale, transparent })` / `blobToBase64` | Rasterizes an exported SVG (default 2×, paper background).                                                        |
| `setAsideEditorState(modeler)` / `restoreEditorState(…)` | Keeps the selection and an open inline editor across a re-import of an externally changed map.                    |

`setEvolutionLabels` turns an empty stage into its default label and `->` into `→`, so the labels
always write a valid `evolution` line; the default set is stored as `undefined`.

Options: `new Modeler({ container, keyboard: { undoRedo: false } })` leaves Cmd/Ctrl+Z/Y to the
host (VS Code owns its document's undo stack). `additionalModules` adds diagram-js modules; every
Wardley feature module is exported for custom editors.

## Events

| Event                        | Payload                           | Notes                                                                                                                             |
| ---------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `import.done`                | `{ warnings }`                    | After every import.                                                                                                               |
| `commandStack.changed`       | `{ trigger }`                     | `Modeler`: after every committed edit, undo and redo, including size, title and label changes.                                    |
| `wardley.config.changed`     | `WardleyConfigChangedEvent`       | Title, size or axis labels changed. `transient` events are live previews (typing, dragging the plot corner): do not persist them. |
| `wardley.label.deduplicated` | `{ element, requested, applied }` | A typed name was taken and a free variant (`Tea 2`) was used instead.                                                             |

### Fonts

The package ships no fonts and uses no CDN. The canvas typeface is **Geist** (Miragon corporate
identity); provide it yourself — recommended self-hosted via [`@fontsource`](https://fontsource.org/)
(one variable file covers all weights):

```ts
import '@fontsource-variable/geist/wght.css';
```

That package registers the family as `'Geist Variable'`; the renderer's font stack starts with
`'Geist Variable', 'Geist', …` so it matches either that package or a locally installed Geist. Use
`'Geist Variable'` in your own CSS too — `'Geist'` alone never matches the self-hosted face.

Part of the [Wardley Maps](https://github.com/Miragon/wardley-maps-modeler) monorepo.

## License

MIT
