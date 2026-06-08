---
paths:
  - '**/package.json'
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`.
Always pin to an exact version (e.g. `"eslint": "9.39.4"`).

This applies to `dependencies`, `devDependencies`, and `peerDependencies` — including internal
`@miragon/wardley-*` workspace deps, which use the exact local version `0.0.0` (not `*`). Exact
pinning is enforced in CI by [`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies).

When adding a new dependency: install it first with `npm install <pkg>` (the root `.npmrc` sets `save-exact=true`, so npm pins the exact version), then verify the installed version with `npm ls <pkg>` or in `package-lock.json` and make sure that exact version is written into `package.json`.
