# Wardley Maps for VS Code

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/miragon-gmbh.wardley-mapping-modeler?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)

View and edit [Wardley Maps](https://learnwardleymapping.com/) directly inside VS Code. The extension
opens `.wmap` / `.owm` files (the [Online-Wardley-Maps text DSL](https://docs.onlinewardleymaps.com/))
in a graphical editor — the text file stays the source of truth, so save, Git, and diff keep working.

![The Wardley Maps editor](https://raw.githubusercontent.com/Miragon/wardley-maps-modeler/main/docs/screenshots/editor.png)

## Features

- **Custom editor for `.wmap` / `.owm`.** Open a map file and you get the full graphical editor; the
  file on disk stays plain OWM-DSL text.
- **The text file is the source of truth.** VS Code handles dirty state, save (`Ctrl/Cmd+S`), Git,
  and diffing for free; editing the text in a split view re-renders the canvas live (two-way sync).
- **Full modeler:** palette, context pad, move, connect, resize, inline label editing, evolve by
  drag. Undo/redo via `Ctrl/Cmd+Z`.
- **Collapsed menu** (top-right, Excalidraw-style): fit-to-view · map size · X-axis labels · export
  SVG/PNG.
- **Export SVG & PNG with the scene embedded** — exported images can be reopened as editable maps.
- **Editable embedded-PNG maps (`*.wmap.png` / `*.owm.png`).** The map is stored inside the PNG (a
  `tEXt` chunk), so the file stays a normal image you can drop into a wiki, README, or chat — and
  still edit graphically.
- **Self-hosted font** — no CDN, offline-capable.

## Getting started

Install **Wardley Maps** from the VS Code Marketplace, then open any `.wmap` or `.owm` file — or
create one with the commands below.

## Commands

- **Wardley: New Empty Map** — pick a location, get a blank map.
- **Wardley: New Map from Example** — same, pre-filled with the Tea Shop example.
- **Wardley: New Empty Map (embedded PNG)** — pick a location for a `*.wmap.png`; press `Ctrl/Cmd+S`
  once to render the first PNG, then edit it like any other map.

To reopen a map as raw text, use **View: Reopen Editor With… → Text Editor**.

## Development

Building from source and the dev loop are documented in
[CONTRIBUTING.md](https://github.com/Miragon/wardley-maps-modeler/blob/main/CONTRIBUTING.md).

## License

MIT
