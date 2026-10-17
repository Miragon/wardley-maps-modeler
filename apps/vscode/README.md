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
  backed by the plain-text file. VS Code tracks dirty state, saving and undo as for any text file.
- **Text and diagram side by side.** The **Open Source to the Side** button in the editor title bar
  opens the text next to the diagram; in the text editor, **Open Diagram to the Side** does the
  reverse. Typing re-renders the canvas live, and a canvas edit rewrites only the lines it changes:
  comments, blank lines, statement order and number formatting stay as you wrote them, and the text
  editor's cursor stays where it is.
- **Problems and highlighting.** Lines the parser cannot read (a typo, a link to a missing
  component) are underlined in the text and listed in the **Problems** view; the diagram shows how
  many there are in its bottom-left corner. The text has syntax highlighting, and
  `Ctrl/Cmd+/` toggles `//` comments.
- **Full modeler:** the floating tool palette at the top and the context pad on a selected element
  (append, connect, evolve, settings, color, delete). Double-click an element to rename it; placing
  a new one opens its name field right away. Drag a component left or right to evolve it, drag its
  label to move just the label (`Alt`+double-click puts it back).
- **Map size:** drag the plot's right or bottom edge or its corner to resize it (`Shift` keeps the
  ratio, `Alt` turns off snapping, double-click the corner to reset), or pick a preset or exact
  width × height in the menu.
- **Collapsed menu** (top left): fit to view · map size · X-axis labels · export SVG, PNG (2×) or
  PNG (4×, transparent). Exports are pictures; the `.wmap` / `.owm` file stays the editable source.
- **Zoom** (bottom right): `−`, the zoom level (click to fit the map) and `+`.
- **Self-hosted font** — no CDN, offline-capable.

## Commands

Run these from the Command Palette (type _"Wardley"_) or the editor title bar:

| Command                                      | What it does                                        |
| -------------------------------------------- | --------------------------------------------------- |
| **Wardley: Open Source to the Side**         | Opens the map's text next to the diagram.           |
| **Wardley: Open Diagram to the Side**        | Opens the diagram next to the map's text.           |
| **Wardley: Fit Map to View**                 | Zooms the diagram to show the whole map.            |
| **Wardley: Export as SVG / PNG**             | Opens a save dialog (defaults to next to the file). |
| **Wardley: Export as PNG (4×, Transparent)** | High-resolution PNG without background, for slides. |

## Keyboard shortcuts on the canvas

| Keys                                | Action                                        |
| ----------------------------------- | --------------------------------------------- |
| `C` · `U` · `N` · `P`               | Add a component · user · note · pipeline      |
| `A`                                 | Connect from the selected element             |
| `L`                                 | Lasso selection                               |
| Arrow keys (`Shift` = bigger steps) | Nudge the selection                           |
| `Delete` / `Backspace`              | Delete the selection                          |
| `Ctrl/Cmd+C` · `V` · `D` · `A`      | Copy · paste · duplicate · select all         |
| `Ctrl/Cmd+Z` · `Ctrl/Cmd+Shift+Z`   | Undo · redo (the file's undo history)         |
| `Ctrl/Cmd+=` · `-` · `0`            | Zoom in · zoom out · fit the map              |
| `Esc`                               | Clear the selection, close the menu or dialog |

## Development

Building from source and the dev loop are documented in
[CONTRIBUTING.md](https://github.com/Miragon/wardley-maps-modeler/blob/main/CONTRIBUTING.md).

## License

MIT
