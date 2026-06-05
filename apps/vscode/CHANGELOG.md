# Changelog

## 0.0.0 — Unreleased

Initial VS Code extension.

- Custom text editor for `.wmap` / `.owm` (OWM-DSL) with the diagram-js Wardley `Modeler`.
- Two-way sync between the text document and the graphical canvas (echo-guarded).
- Collapsed menu (top-right): fit-to-view · map size · X-axis labels · export SVG/PNG. Undo/redo
  is left to VS Code / `Ctrl/Cmd+Z` (no buttons).
- SVG/PNG export with the scene embedded for round-trip reopening.
- Zoom/pan are preserved across document round-trips: only the initial load (and an explicit map-size
  change) fits the view; saving or external edits keep the current viewport, and a document change
  that describes the same map (e.g. a trailing newline added on save) is not re-imported at all.
- Commands: **Wardley: New Empty Map**, **Wardley: New Map from Example**.
