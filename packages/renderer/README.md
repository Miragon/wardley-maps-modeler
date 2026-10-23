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

| Member                                                                     | What it does                                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `importDSL(text)` / `importMap(map)`                                       | Loads a map (replaces the content, clears the undo history). Resolves to `{ warnings }`.                                                            |
| `exportDSL()` / `exportMap()` / `saveSVG()`                                | The map as canonical OWM text, as the JSON model, or as a standalone SVG (never shows selection or hover state).                                    |
| `setTitle(title)`                                                          | Sets the map title (one undo step in the `Modeler`).                                                                                                |
| `getMapSize()`                                                             | The plot size as drawn, whether the map writes it (`size [w, h]`) and the matching preset.                                                          |
| `setMapSize(width, height, { transient })` / `resetMapSize({ transient })` | Changes the plot size (rounded and clamped to 480–5000 × 320–5000). In the `Modeler` one undo step, no re-import; `transient` previews without one. |
| `setEvolutionLabels(labels, { transient })`                                | Sets the four X-axis stage labels (normalized, see below); `transient` previews without an undo step.                                               |
| `undo()` / `redo()` / `canUndo()` / `canRedo()`                            | `Modeler` only: the canvas command stack.                                                                                                           |
| `commitPendingEdits()`                                                     | `Modeler` only: saves an open inline editor, e.g. before a save shortcut.                                                                           |
| `on(event, callback)` / `off(event, callback)`                             | diagram-js events, see below.                                                                                                                       |
| `svgToPng(svg, { scale, transparent })` / `blobToBase64`                   | Rasterizes an exported SVG (default 2×, paper background).                                                                                          |
| `setAsideEditorState(modeler)` / `restoreEditorState(…)`                   | Keeps the selection and an open inline editor across a re-import of an externally changed map.                                                      |

`setEvolutionLabels` turns an empty stage into its default label and `->` into `→`, so the labels
always write a valid `evolution` line; the default set is stored as `undefined`.

An import validates the whole map first: a map that is not importable rejects before the canvas
changes, and a rendering failure puts the previous map back. It then fits the view to the plot with
its axis margins, centred in the free area and never above 100 %. Without a `freeArea` the pan
constraint may still move a map smaller than the view, to keep its margins around it.

An open inline editor (name, note, link annotation, flow value, link address) stays open with its
typed text across a view change, a scroll, a zoom or a host's fit, and moves with its element;
Enter, leaving the field, or a click or drag on the canvas saves it.

Options (the names of the `@miragon/modeler-api` 1.2 factory options):

- `undoRedoKeys: false` leaves Cmd/Ctrl+Z, Shift+Z and Y to the host (VS Code owns its document's
  undo stack).
- `freeArea: { insets: () => ({ top, right, bottom, left }) }` names the canvas edges a host's chrome
  covers: the import fits the plot into the rest, panning keeps the map inside it, a view the host
  fitted into it stays where the host put it, and keyboard creation places elements in its centre.
  `freeArea: { center: () => ({ x, y }) }` gives only that centre, in diagram coordinates.
- `fitOnImport: false` leaves the view after an import to the host, whose chrome fits it.
- `additionalModules` adds diagram-js modules; every Wardley feature module is exported for custom
  editors.

`keyboard: { undoRedo }` and `freeRectInsets` still work for this minor release, as deprecated
aliases of `undoRedoKeys` and `freeArea: { insets }`; given both, the aligned name wins.

The `wardleyReadOnly` service (`modeler.get<WardleyReadOnly>('wardleyReadOnly').setReadOnly(true)`)
locks the canvas while its host cannot save an edit, e.g. while the document is invalid: every edit
rule is vetoed, an open editor, popup or drag ends without saving, the handles hide, and selection,
zoom, pan, select all and export stay. It fires `wardley.readOnly.changed`.

## Collaborative hosts

`createCollaborativeModeler()` and `createCollaborativeViewer()` implement the
[`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api) collaborative-modeler
contract (notation `wardley`), for hosts that keep the map text in a shared document:

```ts
import { createCollaborativeModeler } from '@miragon/wardley-renderer';
import '@miragon/wardley-renderer/assets/wardley.css';

const modeler = createCollaborativeModeler();
modeler.attachTo(document.querySelector('#canvas')!);
await modeler.importText(documentText);
modeler.onContentChanged(() => save(modeler.exportText()));
```

An import is silent (no content change is reported back), keeps the selection and an open label
editor and fits the view (unless `fitOnImport: false`); a host's view change (`setViewState`, a fit)
never saves an open editor either. `exportText()` is the committed document, never a live preview:
while the plot corner is dragged or the size or axis-label popover previews a change, it returns the
document as it was before, and the change event of the commit brings the new one. A command during a
size preview (an undo pressed mid-drag, a title the host sets) puts the preview back first, and a
drag then ends without resizing, so the history stays in step with the document. `elements` names
components, anchors, pipelines, submaps and accelerators by the id the document gives them
(`cmp_kettle`), also right after a canvas edit, and `elements.bounds(id)` gives an element's live
box in diagram coordinates; `getViewState` and `setViewState` carry the viewbox. `contentBounds()`
(contract 1.3) gives the box a host fits the view to, in diagram coordinates and without padding:
the plot with its axes and everything drawn beyond it (a long label at the commodity edge, a note in
the margin), the box the pan constraint keeps in view. It follows every edit at once and stays the
same across zoom and scroll. A map without elements still has its plot, so it is never `undefined`
while the modeler lives (before the first import it is the default plot); tell an empty map by its
elements. `diagram` is the wrapped `Modeler` or `NavigatedViewer` for host-specific wiring. Both
factories take the options above (`additionalModules`, `freeArea`, `fitOnImport`, `undoRedoKeys`
and the deprecated aliases); the viewer never edits and ignores the undo keys. Both pass the
contract's conformance kit (1.3) without skips.

### Menu entries and dialogs for a host's chrome

The map's entries of a chrome menu (Model: "Map title…" where the host passes `mapTitle`, "Map
size…" and "X-axis labels…"; Export; Help) come from `mapMenu(actions)`, in the shape the menu
groups of [`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell) take.
`createMapSizePopover(chrome, modeler)` and `createAxisLabelsPopover(chrome, modeler)` build the two
popovers (a live preview, one undo step when done), `createTitleDialog(chrome, modeler)` the "Map
title…" dialog (one undo step on Apply, nothing for an unchanged title),
`createShortcutsDialog(chrome, options)` the "Keyboard shortcuts…" dialog and
`mapShortcuts(chrome, options)` its table. A web app that binds Cmd/Ctrl+O, Cmd/Ctrl+S, Cmd/Ctrl+V
on the canvas and `?` itself passes `{ fileKeys: true, shortcutsKey: '?' }`, so the dialog lists
them too, and `mapMenu({ …, shortcutsKey: '?' })` shows the key's chip on "Keyboard shortcuts…".
`createMapDialog(chrome, parts)` is the modal dialog all of them share (guide §8: header with Close,
scrolling body, footer), for a host's own dialogs in the same look; `dialogButton(label, variant)`
gives its buttons. `chrome` is the shell handle or anything of the same shape; the renderer never
imports the shell itself.

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

The tool icons of the palette (`square-dashed-mouse-pointer`, and for Draw `spline` with a
straight segment) and the Close icon of the dialogs (`x`) are copied from
[Lucide](https://lucide.dev) (`lucide-static` 1.59.0):

> ISC License
>
> Copyright (c) 2026 Lucide Icons and Contributors
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without
> fee is hereby granted, provided that the above copyright notice and this permission notice
> appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
> SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
> AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
> NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
> PERFORMANCE OF THIS SOFTWARE.

`x` is derived from [Feather](https://feathericons.com):

> The MIT License (MIT)
>
> Copyright (c) 2013-present Cole Bemis
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
> BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The other icons (the context pad, and the `ICON_*` exports with `iconMarkup`, which are deprecated
since the chrome's icons come from `@miragon/modeler-shell` and go in a later minor) are
[Material Icons](https://fonts.google.com/icons) by Google, under the Apache License 2.0.
