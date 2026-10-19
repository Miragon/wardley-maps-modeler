---
paths:
  - '**/package.json'
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`.
Always pin to an exact version (e.g. `"eslint": "9.39.4"`).

This applies to `dependencies` and `devDependencies` — including internal
`@miragon/wardley-*` workspace deps, which pin to the **current version of that workspace package**
(e.g. `"@miragon/wardley-dsl": "0.6.0"`), not a range (`*`).

**Exception — `peerDependencies`:** consumer-shared runtime libs (`zod`, and the
`diagram-js`/`didi`/`tiny-svg` ecosystem in the renderer) are declared as **ranged** peers
(e.g. `zod: "^4.6.0"`), so a consumer dedupes them against its own copy instead of getting a second
exact-pinned duplicate — duplicate `zod`/diagram-js instances break `instanceof`/schema identity and
the diagram-js DI injector. Every ranged peer is mirrored by an **exact** `devDependency` (for local
build/test), and the bundling apps (`webapp`, `vscode`) declare it as an exact `dependency`. The
`miragon/pin-npm-dependencies` CI check does **not** inspect `peerDependencies` by default, so these
ranges are allowed. Each package is released with its own version, and release-please's
`node-workspace` plugin bumps every internal `@miragon/wardley-*` reference (also in
`peerDependencies`) when the package it names is released, so a new internal dependency edge needs
no release config (see [`CLAUDE.md`](../../CLAUDE.md) → Releases). Exact pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies).

When adding a new dependency: install it first with `npm install <pkg>` (the root `.npmrc` sets `save-exact=true`, so npm pins the exact version), then verify the installed version with `npm ls <pkg>` or in `package-lock.json` and make sure that exact version is written into `package.json`.
