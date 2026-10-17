# Wardley Maps — Web App

[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)

A browser editor for [Wardley Maps](https://learnwardleymapping.com/): an Excalidraw-style canvas
with URL sharing, `.wmap`/`.owm`/`.json` open (drop anywhere, or paste OWM text or a share link
onto the canvas) and download, an OWM-DSL text view you can edit and apply, and PNG/SVG picture
export. Replacing the map is never final: a "Map replaced · Undo" toast brings the previous one
back. Press `?` for the keyboard shortcuts. The demo app for the `@miragon/wardley-*` packages.

**[Live demo](https://wardley-maps.modeler.miragon.io)**

![The web app](../../docs/screenshots/editor.png)

## Run locally

From the monorepo root:

```bash
npm install
npm run dev:webapp   # http://localhost:5180
```

## License

MIT
