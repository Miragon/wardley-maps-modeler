# Wardley Maps — Web App

[![License: MIT](https://img.shields.io/github/license/Miragon/wardley-maps-modeler)](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)

A browser editor for [Wardley Maps](https://learnwardleymapping.com/) in the shared chrome of the
Miragon modelers ([`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell),
web host): a start card, a menu with File, Model, Export and Help, Share as the primary action, the
zoom panel, toasts, a problems list and the legal line. Maps are shared as links (the map lives in
the URL hash), opened from `.wmap`/`.owm`/`.json` files (Open…, drop anywhere, or paste OWM text or a
share link onto the canvas), edited as OWM-DSL text with Apply, and exported as PNG, SVG, JSON or
`.wmap`. Replacing the map is never final: a "Map replaced · Undo" toast brings the previous one back.
Press `?` for the keyboard shortcuts. The demo app for the `@miragon/wardley-*` packages.

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
