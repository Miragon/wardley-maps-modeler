# Changelog

## [0.2.0](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.1.1...vscode-v0.2.0) (2026-06-10)


### Bug Fixes

* **release:** unique Marketplace display name + independent idempotent npm publish ([#32](https://github.com/Miragon/wardley-maps-modeler/issues/32)) ([a366397](https://github.com/Miragon/wardley-maps-modeler/commit/a366397b7ed18ceb82c48f9a2665ba383833e8cb))
* repair release publishing (vscode packaging + npm dry-run footgun) ([#30](https://github.com/Miragon/wardley-maps-modeler/issues/30)) ([7865c15](https://github.com/Miragon/wardley-maps-modeler/commit/7865c1575f8cb0376cc92c8309696152c49a0597))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.1.1 to 0.2.0
    * @miragon/wardley-renderer bumped from 0.1.1 to 0.2.0
    * @miragon/wardley-schema-model bumped from 0.1.1 to 0.2.0

## [0.1.1](https://github.com/Miragon/wardley-maps-modeler/compare/vscode-v0.1.0...vscode-v0.1.1) (2026-06-09)


### Bug Fixes

* repair release publishing (vscode packaging + npm dry-run footgun) ([#30](https://github.com/Miragon/wardley-maps-modeler/issues/30)) ([7865c15](https://github.com/Miragon/wardley-maps-modeler/commit/7865c1575f8cb0376cc92c8309696152c49a0597))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.1.0 to 0.1.1
    * @miragon/wardley-renderer bumped from 0.1.0 to 0.1.1
    * @miragon/wardley-schema-model bumped from 0.1.0 to 0.1.1

## 0.1.0 (2026-06-09)


### Miscellaneous Chores

* **vscode:** Synchronize wardley versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.0.0 to 0.1.0
    * @miragon/wardley-renderer bumped from 0.0.0 to 0.1.0
    * @miragon/wardley-schema-model bumped from 0.0.0 to 0.1.0

## 0.0.0 — Unreleased

Initial VS Code extension.

- Custom text editor for `.wmap` / `.owm` (OWM-DSL) with the diagram-js Wardley `Modeler`.
- Two-way sync between the text document and the graphical canvas (echo-guarded).
- Collapsed menu (top-right): fit-to-view · map size · X-axis labels · export SVG/PNG. Undo/redo
  is left to VS Code / `Ctrl/Cmd+Z` (no buttons).
- SVG/PNG export with the scene embedded for round-trip reopening.
- **Editable embedded-PNG maps** (`*.wmap.png` / `*.owm.png`): a binary custom editor opens these
  files directly, reads the Wardley map from the embedded `tEXt` chunk, and on save re-renders the
  PNG with the updated map embedded again — the file stays a normal, shareable PNG. Command:
  **Wardley: New Empty Map (embedded PNG)**.
- Coloured notes: a note's context pad opens a 3×3 swatch picker (8 base colours + "no colour");
  the colour round-trips in the DSL as `note … (color #hex)`. Pairs with the Wardley-mapping skill,
  which writes colour-coded feedback notes onto a map.
- Zoom/pan are preserved across document round-trips: only the initial load (and an explicit map-size
  change) fits the view; saving or external edits keep the current viewport, and a document change
  that describes the same map (e.g. a trailing newline added on save) is not re-imported at all.
- Commands: **Wardley: New Empty Map**, **Wardley: New Map from Example**.
