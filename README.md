# Wardley Maps

[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](LICENSE)
[![CI](https://github.com/Miragon/wardley-maps-modeler/actions/workflows/ci.yml/badge.svg)](https://github.com/Miragon/wardley-maps-modeler/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@miragon/wardley-renderer)](https://www.npmjs.com/package/@miragon/wardley-renderer)
[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/miragon-gmbh.wardley-mapping-modeler?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler)

Create, edit and embed [Wardley Maps](https://learnwardleymapping.com/) — a TypeScript library, a
VS Code extension, and a web app, all built on [diagram-js](https://github.com/bpmn-io/diagram-js).

**[Try the web app →](https://wardley-maps.netlify.app)**

![The Wardley Maps editor](docs/screenshots/editor.png)

## Install

```bash
npm install @miragon/wardley-renderer
```

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

## What you get

- **Embeddable viewer & modeler** on diagram-js — palette, context pad, move/connect/resize, inline
  labels, undo/redo, evolve-by-drag.
- **Lossless [OWM-DSL](https://docs.onlinewardleymaps.com/) round-trip** and a deterministic JSON model.
- **VS Code extension** — a custom editor for `.wmap` / `.owm` files.
- **Web app** — an Excalidraw-style editor with URL sharing and PNG/SVG export (scene embedded for
  re-import).
- **Strict DOM-free core** (model, DSL, transforms) — usable in any JavaScript runtime.
- **Self-hosted fonts** — no CDN, offline-capable.

## Packages

| Package                                                  | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- |
| [`@miragon/wardley-schema-model`](packages/schema-model) | Metamodel, Zod validation, deterministic JSON (DOM-free) |
| [`@miragon/wardley-dsl`](packages/dsl)                   | OWM text DSL ↔ model, lossless round-trip (DOM-free)     |
| [`@miragon/wardley-transforms`](packages/transforms)     | Pure `WardleyMap → WardleyMap` transforms (DOM-free)     |
| [`@miragon/wardley-renderer`](packages/renderer)         | diagram-js renderer, viewer, import/export               |
| [`apps/webapp`](apps/webapp)                             | Web editor (demo, deployed on Netlify)                   |
| [`apps/vscode`](apps/vscode)                             | VS Code extension for `.wmap` / `.owm`                   |

## Fonts

The renderer ships no fonts and loads nothing from a CDN. Provide your own — recommended self-hosted
via [`@fontsource`](https://fontsource.org/):

```ts
import '@fontsource-variable/spline-sans';
```

Without a font the fallback chain degrades cleanly to system sans.

## Supported Wardley elements

<details>
<summary>Coverage against the OWM element reference</summary>

| Element / syntax                                    | Model | Render | DSL ↔ |
| --------------------------------------------------- | :---: | :----: | :---: |
| Component `[visibility, maturity]`                  |  ✅   |   ✅   |  ✅   |
| Anchor / user                                       |  ✅   |   ✅   |  ✅   |
| Dependency `->`                                     |  ✅   |   ✅   |  ✅   |
| Flow `+>` / `+<>` / `+<` / `+'value'>`              |  ✅   |   ✅   |  ✅   |
| Evolution `evolve`                                  |  ✅   |   ✅   |  ✅   |
| Inertia                                             |  ✅   |   ✅   |  ✅   |
| Pipeline `[matStart, matEnd]`                       |  ✅   |   ✅   |  ✅   |
| Build / buy / outsource                             |  ✅   |   ✅   |  ✅   |
| Market / ecosystem                                  |  ✅   |   ✅   |  ✅   |
| Accelerator / deaccelerator                         |  ✅   |   ✅   |  ✅   |
| Pioneers / settlers / town planners                 |  ✅   |   ✅   |  ✅   |
| Note                                                |  ✅   |   ✅   |  ✅   |
| Annotation                                          |  ✅   |   ✅   |  ✅   |
| Submap                                              |  ✅   |   ✅   |  ✅   |
| `title` / `style` / `size` / `evolution` / `y-axis` |  ✅   |   ✅   |  ✅   |

</details>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the inner-loop commands.

## License

[MIT](LICENSE)
