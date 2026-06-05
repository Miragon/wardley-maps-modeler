# Wardley Maps for VS Code

View and edit [Wardley Maps](https://learnwardleymapping.com/) directly inside VS Code. The
extension opens `.wmap` / `.owm` files (the
[Online-Wardley-Maps text DSL](https://docs.onlinewardleymaps.com/)) in a graphical editor built on
the shared `@wardley/*` core — the same diagram-js engine that powers the web app.

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
- **Self-hosted font** (no Google Fonts CDN) — offline-capable and GDPR-friendly.

## Commands

- **Wardley: New Empty Map** — pick a location, get a blank map.
- **Wardley: New Map from Example** — same, pre-filled with the Tea Shop example.

To reopen a map as raw text, use **View: Reopen Editor With… → Text Editor**.

## How it works

```
.wmap / .owm  ──▶  TextDocument (OWM-DSL)  ◀──▶  Webview (diagram-js Modeler)
                         │                              │
        Save / Git / Undo (VS Code)            graphical editing, undo/redo
```

- The webview (`dist/webview.js`) bundles the `@wardley/renderer` `Modeler` plus the schema/DSL
  packages from source, so the build is self-contained.
- The extension host (`dist/extension.cjs`) registers a `CustomTextEditorProvider` and brokers the
  message protocol (`src/protocol.ts`): `init`/`update` (host → webview) and `edit`/`export`
  (webview → host). An echo guard prevents the editor's own writes from resetting the canvas.

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @wardley/vscode build       # one-off build (dist/)
pnpm --filter @wardley/vscode watch       # rebuild on change
pnpm --filter @wardley/vscode typecheck   # tsc --noEmit
```

Then press **F5** in VS Code (or run the “Run Extension” launch config) to open an Extension
Development Host, and open any `.wmap` file.

Package a `.vsix`:

```bash
pnpm --filter @wardley/vscode build
pnpm --filter @wardley/vscode package
```

## License

MIT — see [LICENSE](./LICENSE).
