---
paths:
  - '**/package.json'
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`.
Always pin to an exact version (e.g. `"eslint": "9.39.4"`).

This applies to `dependencies` and `devDependencies` — including internal
`@miragon/wardley-*` workspace deps, which pin to the **current shared version** of the monorepo
(e.g. `0.2.1`), not a range (`*`).

**Exception — `peerDependencies`:** consumer-shared runtime libs (`zod`, and the
`diagram-js`/`didi`/`tiny-svg` ecosystem in the renderer) are declared as **ranged** peers
(e.g. `zod: "^4.6.0"`), so a consumer dedupes them against its own copy instead of getting a second
exact-pinned duplicate — duplicate `zod`/diagram-js instances break `instanceof`/schema identity and
the diagram-js DI injector. Every ranged peer is mirrored by an **exact** `devDependency` (for local
build/test), and the bundling apps (`webapp`, `vscode`) declare it as an exact `dependency`. The
`miragon/pin-npm-dependencies` CI check does **not** inspect `peerDependencies` by default, so these
ranges are allowed. The whole repo shares one version, and release-please keeps every
internal dep reference in sync on each release via the `extra-files` list in `release-please-config.json`
(see [`CLAUDE.md`](../../CLAUDE.md) → Releases). **When you add a new internal `@miragon/wardley-*`
dependency edge, add a matching `extra-files` entry for it**, otherwise that reference will not be
bumped and will go stale. Exact pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies).

When adding a new dependency: install it first with `npm install <pkg>` (the root `.npmrc` sets `save-exact=true`, so npm pins the exact version), then verify the installed version with `npm ls <pkg>` or in `package-lock.json` and make sure that exact version is written into `package.json`.
