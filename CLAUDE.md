# CLAUDE.md

TypeScript library for viewing and editing [Wardley Maps](https://learnwardleymapping.com/),
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets:
a web app and a VS Code extension.

## Monorepo (pnpm workspace)

Versions are centrally pinned via `catalog:` in `pnpm-workspace.yaml`.

| Package                 | Purpose                                                         | DOM |
| ----------------------- | --------------------------------------------------------------- | --- |
| `@wardley/schema-model` | Metamodel, Zod validation, stage derivation, JSON serialization | no  |
| `@wardley/dsl`          | OWM text DSL ↔ model (lossless round-trip)                      | no  |
| `@wardley/transforms`   | Pure `WardleyMap → WardleyMap` transforms (evolve, inertia, …)  | no  |
| `@wardley/renderer`     | diagram-js bootstrap, renderer, viewer, import/export, CSS      | yes |
| `apps/webapp`           | Vite demo editor                                                | yes |
| `apps/vscode`           | VS Code extension: custom editor for `.wmap`/`.owm`             | yes |

**P1 — DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`).
Enforced twice — ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** `dependency-cruiser`
— so a violating import fails `pnpm lint` and `pnpm depcruise`.

## Commands

- `pnpm build` — all packages · `pnpm build:webapp` · `pnpm build:vscode`
- `pnpm dev:webapp` · `pnpm dev:vscode`
- `pnpm test` — Vitest · `pnpm typecheck` · `pnpm lint` (ESLint + typecheck)
- `pnpm format` — Prettier · `pnpm depcruise` — check the module graph

Requirements: Node ≥ 20.19, pnpm 11. Build packages before running tests (workspace deps resolve to
`dist`). The Husky pre-commit hook runs **only** lint-staged + `pnpm lint` (ESLint + type-check) —
**not** tests/build/depcruise; run `pnpm test` yourself before pushing.

## Git

Everything is managed via **Conventional Commits** — primarily `feat`, `fix`, `refactor`, `chore`,
`docs`. Example: `feat(renderer): add inertia decorator`.

## Conventions

- Keep core packages (`schema-model`, `dsl`, `transforms`) strictly DOM-free (P1, above).
- The OWM-DSL round-trip must stay lossless; JSON serialization must be deterministic.
- Pin dependencies exactly via `catalog:` — no version ranges (`^`/`~`/`>=`/`*`); see
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- For Wardley-map domain work, use the skill in
  [`.claude/skills/wardley-mapping/`](.claude/skills/wardley-mapping/).
- Architecture details in [`docs/KONZEPT.md`](docs/KONZEPT.md);
  contributor onboarding in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Code Style

- Write comments only when explicitly requested. Otherwise write self-explanatory code — descriptive
  function and parameter names, no abbreviations.
- If comments are needed: make them **WHY**-driven, not **HOW**.
