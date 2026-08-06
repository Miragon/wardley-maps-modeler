# Wardley Maps for VS Code

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/miragon-gmbh.wardley-mapping-modeler?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.wardley-mapping-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)

[Wardley Maps](https://learnwardleymapping.com/) chart the components of a business by user value and
evolution, so you can see your landscape and reason about strategy. This extension lets you create and
edit them directly inside VS Code: it opens `.wmap` / `.owm` files (a simple plain-text format, the
[Online-Wardley-Maps DSL](https://docs.onlinewardleymaps.com/)) in a graphical editor, while the
text file stays the source of truth, so save, Git, and diff keep working.

![The Wardley Maps editor](https://raw.githubusercontent.com/Miragon/wardley-maps-modeler/main/docs/screenshots/editor.png)

New to Wardley Mapping? Start with [Learn Wardley Mapping](https://learnwardleymapping.com/).

## Getting started

Install **Wardley Mapping Modeler** (publisher `miragon-gmbh`) from the VS Code Marketplace, then
start from a filled-in Tea Shop example or a blank map. The built-in **Get Started with Wardley Maps**
walkthrough is the recommended first stop: click its **Create map from example** button and you have a
ready-made map to explore. From there you can open any `.wmap` or `.owm` file.

Prefer commands? Run these from the Command Palette (`Cmd/Ctrl+Shift+P`, type _"Wardley"_):

- **Wardley: New Map from Example** — pick a location, pre-filled with the Tea Shop example.
- **Wardley: New Empty Map** — same, but a blank map (also under **File > New File…**).

## Reading a map

Every component sits on two axes:

- **Up and down** is the value chain: the higher a component sits, the more visible it is to your user.
- **Left and right** is evolution: components mature from genesis (brand-new, experimental) on the
  left, through custom-built and product, to commodity (standardised, ubiquitous) on the right.

Together they show _what_ you depend on and _how mature_ each piece is.

## Editing a map

- **Custom editor for `.wmap` / `.owm`.** Open a map file and you get the full graphical editor,
  backed by the plain-text file. Editing the text in a split view re-renders the canvas live
  (two-way sync), and VS Code tracks dirty state as you go. To reopen a map as raw text, use
  **View: Reopen Editor With…**, then pick **Text Editor**.
- **Full modeler:** the tool palette on the side and the context pad on a selected component (add,
  connect, append, delete), move, resize, inline label editing, set component colors, and evolve
  (drag a component left or right along the maturity axis). Undo/redo via `Ctrl/Cmd+Z` and
  `Ctrl/Cmd+Shift+Z`.
- **Collapsed menu** (top-right, Excalidraw-style): fit-to-view · map size · X-axis labels · export
  SVG/PNG (as a picture).
- **Self-hosted font** — no CDN, offline-capable.

## Development

Building from source and the dev loop are documented in
[CONTRIBUTING.md](https://github.com/Miragon/wardley-maps-modeler/blob/main/CONTRIBUTING.md).

## License

MIT
