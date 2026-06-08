# Wardley Maps for VS Code

View and edit [Wardley Maps](https://learnwardleymapping.com/) directly inside VS Code. The
extension opens `.wmap` / `.owm` files (the
[Online-Wardley-Maps text DSL](https://docs.onlinewardleymaps.com/)) in a graphical editor built on
the shared `@miragon/wardley-*` core — the same diagram-js engine that powers the web app.

> Original code on top of [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). `bpmn-js` is
> never a dependency (its license carries a watermark requirement). The extension structure follows
> the proven layout of [Miragon's bpmn-modeler](https://github.com/Miragon/bpmn-modeler).

## Features

- **Custom editor for `.wmap` / `.owm`.** Open a map file and you get the full graphical editor;
  the file on disk stays plain OWM-DSL text.
- **The text file is the source of truth.** VS Code handles dirty state, save (`Ctrl/Cmd+S`),
  Git, and diffing for free. Graphical edits are written back as a `WorkspaceEdit`; editing the
  text in a split view re-renders the canvas live (two-way sync).
- **Full modeler:** palette, context pad, move, connect, resize, inline label editing, evolve by
  drag. **Undo/redo via `Ctrl/Cmd+Z`** — no toolbar buttons needed (the canvas owns the keyboard).
- **Collapsed menu** (top-right, Excalidraw-style): fit-to-view · map size · X-axis labels ·
  export SVG/PNG.
- **Export SVG & PNG with the scene embedded** (idea borrowed from Excalidraw) — exported images
  can be reopened as editable maps.
- **Editable embedded-PNG maps (`*.wmap.png` / `*.owm.png`).** Open such a file and you edit the
  Wardley map graphically just like a `.wmap`; the map is stored inside the PNG (a `tEXt` chunk),
  so the file stays a normal image you can drop into a wiki, README, or chat. Saving re-renders the
  picture and re-embeds the updated map. (Only PNGs that carry an embedded map are editable here.)
- **Self-hosted font** (no Google Fonts CDN) — offline-capable and GDPR-friendly.

## Commands

- **Wardley: New Empty Map** — pick a location, get a blank map.
- **Wardley: New Map from Example** — same, pre-filled with the Tea Shop example.
- **Wardley: New Empty Map (embedded PNG)** — pick a location for a `*.wmap.png`; press
  `Ctrl/Cmd+S` once to render the first PNG, then edit it like any other map.

To reopen a map as raw text, use **View: Reopen Editor With… → Text Editor**. To open a
`*.wmap.png` as a plain image instead, use **View: Reopen Editor With… → Image Preview**.

## How it works

```
.wmap / .owm  ──▶  TextDocument (OWM-DSL)  ◀──▶  Webview (diagram-js Modeler)
                         │                              │
        Save / Git / Undo (VS Code)            graphical editing, undo/redo
```

- The webview (`dist/webview.js`) bundles the `@miragon/wardley-renderer` `Modeler` plus the schema/DSL
  packages from source, so the build is self-contained.
- The extension host (`dist/extension.cjs`) registers a `CustomTextEditorProvider` and brokers the
  message protocol (`src/protocol.ts`): `init`/`update` (host → webview) and `edit`/`export`
  (webview → host). An echo guard prevents the editor's own writes from resetting the canvas.
- For `*.wmap.png` / `*.owm.png` the host registers a second, **binary** `CustomEditorProvider`. The
  PNG is opened as a `CustomDocument`; the embedded OWM-DSL (a `tEXt` chunk) is the in-memory source
  of truth and drives the same webview. Because rasterising needs a browser canvas, saving is a
  round-trip: the host asks the webview (`requestPng`) for the freshly rendered PNG with the map
  re-embedded (`pngResponse`) and writes those bytes. `retainContextWhenHidden` keeps the modeler
  alive so background saves can still render.

## Development

From the monorepo root:

```bash
npm install
npm run build -w apps/vscode       # one-off build (dist/)
npm run watch -w apps/vscode       # rebuild on change
npm run typecheck -w apps/vscode   # tsc --noEmit
```

Then press **F5** in VS Code (or run the “Run Extension” launch config) to open an Extension
Development Host, and open any `.wmap` file.

Package a `.vsix`:

```bash
npm run build -w apps/vscode
npm run package -w apps/vscode     # -> wardley-mapping-modeler.vsix
```

## License

MIT — see [LICENSE](./LICENSE).
