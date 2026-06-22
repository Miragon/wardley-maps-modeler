# CLAUDE.md

TypeScript library for viewing and editing [Wardley Maps](https://learnwardleymapping.com/),
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets:
a web app and a VS Code extension.

## Monorepo (npm workspaces)

Workspaces are declared in the root `package.json` (`workspaces` array, listed in topological
build order). **All** versions are pinned to exact values inline in each package's `package.json`
(`.npmrc` sets `save-exact=true`) — including internal `@miragon/wardley-*` deps, which pin to the
**current shared version** (e.g. `0.2.1`; npm links them to the local workspace because the local
version satisfies the pin). Exact pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies) (the `pin-check`
job).

| Package                         | Purpose                                                         | DOM |
| ------------------------------- | --------------------------------------------------------------- | --- |
| `@miragon/wardley-schema-model` | Metamodel, Zod validation, stage derivation, JSON serialization | no  |
| `@miragon/wardley-dsl`          | OWM text DSL ↔ model (lossless round-trip)                      | no  |
| `@miragon/wardley-transforms`   | Pure `WardleyMap → WardleyMap` transforms (evolve, inertia, …)  | no  |
| `@miragon/wardley-renderer`     | diagram-js bootstrap, renderer, viewer, import/export, CSS      | yes |
| `apps/webapp`                   | Vite demo editor                                                | yes |
| `apps/vscode`                   | VS Code extension: custom editor for `.wmap`/`.owm`             | yes |

**P1 — DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`).
Enforced twice — ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** `dependency-cruiser`
— so a violating import fails `npm run lint` and `npm run depcruise`.

## Commands

- `npm run build` — all packages · `npm run build:webapp` · `npm run build:vscode`
- `npm run dev:webapp` · `npm run dev:vscode` · `npm run dev:webapp:portless` (per-worktree
  `https://<workspace>.localhost` URL via [Portless](https://portless.sh); one-time host setup — see
  [`CONTRIBUTING.md`](CONTRIBUTING.md))
- `npm test` — Vitest · `npm run typecheck` · `npm run lint` (ESLint + typecheck)
- `npm run format` — Prettier · `npm run depcruise` — check the module graph

Requirements: Node ≥ 22.13, npm. Build packages before running tests (workspace deps resolve to
`dist`). The Husky pre-commit hook runs **only** lint-staged + `npm run lint` (ESLint + type-check) —
**not** tests/build/depcruise; run `npm test` yourself before pushing.

## Git

Everything is managed via **Conventional Commits** — primarily `feat`, `fix`, `refactor`, `chore`,
`docs`. Example: `feat(renderer): add inertia decorator`.

## Releases

One shared version for the whole monorepo, one tag (`vX.Y.Z`), one GitHub release, one root
[`CHANGELOG.md`](CHANGELOG.md) — driven by [release-please](https://github.com/googleapis/release-please)
on push to `main` ([`.github/workflows/release-please.yml`](.github/workflows/release-please.yml)).
The config ([`release-please-config.json`](release-please-config.json)) uses a **single root
component** (`"."`, `include-component-in-tag: false`); its `extra-files` list bumps `$.version` in
every sub-package's `package.json` **and** every internal `@miragon/wardley-*` dependency reference,
keeping all versions in lockstep. Merging the release PR tags the repo and publishes the four
`packages/*` libraries to npm and the VS Code extension to the Marketplace.

**Adding a new internal dependency edge** (`@miragon/wardley-*` referenced by another package)
requires a new `extra-files` entry for that `$.dependencies['@miragon/wardley-…']` path, or the
reference will not be bumped on release and will go stale. Likewise add `$.version` (and any internal
dep) entries when adding a whole new package.

## Conventions

- Keep core packages (`schema-model`, `dsl`, `transforms`) strictly DOM-free (P1, above).
- The OWM-DSL round-trip must stay lossless; JSON serialization must be deterministic.
- Pin **all** dependencies to exact versions — no version ranges (`^`/`~`/`>=`/`*`), internal
  workspace deps included (pinned to the current shared version, kept in sync by release-please).
  CI-enforced via `miragon/pin-npm-dependencies`. See
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- For Wardley-map domain work, use the skill in
  [`.claude/skills/wardley-mapping/`](.claude/skills/wardley-mapping/).
- Contributor onboarding in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Code Style

- Write comments only when explicitly requested. Otherwise write self-explanatory code — descriptive
  function and parameter names, no abbreviations.
- If comments are needed: make them **WHY**-driven, not **HOW**.
