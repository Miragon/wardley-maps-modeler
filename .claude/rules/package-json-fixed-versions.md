---
paths:
  - '**/package.json'
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`.
Always pin to an exact version (e.g. `"eslint": "9.39.4"`).

This applies to `dependencies`, `devDependencies`, and `peerDependencies` — including internal
`@miragon/wardley-*` workspace deps, which pin to the **current shared version** of the monorepo
(e.g. `0.2.1`), not a range (`*`). The whole repo shares one version, and release-please keeps every
internal dep reference in sync on each release via the `extra-files` list in `release-please-config.json`
(see [`CLAUDE.md`](../../CLAUDE.md) → Releases). **When you add a new internal `@miragon/wardley-*`
dependency edge, add a matching `extra-files` entry for it**, otherwise that reference will not be
bumped and will go stale. Exact pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies).

When adding a new dependency: install it first with `npm install <pkg>` (the root `.npmrc` sets `save-exact=true`, so npm pins the exact version), then verify the installed version with `npm ls <pkg>` or in `package-lock.json` and make sure that exact version is written into `package.json`.
