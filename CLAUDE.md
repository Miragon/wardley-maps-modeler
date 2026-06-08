# CLAUDE.md

TypeScript library for viewing and editing [Wardley Maps](https://learnwardleymapping.com/),
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets:
a web app and a VS Code extension.

## Monorepo (pnpm workspace)

Versions are centrally pinned via `catalog:` in `pnpm-workspace.yaml`.

| Package                   | Purpose                                                           | DOM |
| ------------------------- | ---------------------------------------------------------------- | --- |
| `@wardley/schema-model`   | Metamodel, Zod validation, stage derivation, JSON serialization  | no  |
| `@wardley/dsl`            | OWM text DSL ↔ model (lossless round-trip)                       | no  |
| `@wardley/transforms`     | Pure `WardleyMap → WardleyMap` transforms (evolve, inertia, …)   | no  |
| `@wardley/renderer`       | diagram-js bootstrap, renderer, viewer, import/export, CSS       | yes |
| `apps/webapp`             | Vite demo editor                                                 | yes |
| `apps/vscode`             | VS Code extension: custom editor for `.wmap`/`.owm`            | yes |

The DOM-freedom of the core packages is enforced twice: ESLint (`no-restricted-imports` /
`no-restricted-globals`) and `dependency-cruiser`. Keep new imports/globals in core packages clean
accordingly.

## Commands

- `pnpm build` — all packages · `pnpm build:webapp` · `pnpm build:vscode`
- `pnpm dev:webapp` · `pnpm dev:vscode`
- `pnpm test` — Vitest · `pnpm typecheck` · `pnpm lint` (ESLint + typecheck)
- `pnpm format` — Prettier · `pnpm depcruise` — check the module graph

Requirements: Node ≥ 20.19, pnpm 11. Husky + lint-staged format/lint pre-commit.

## Git

Everything is managed via **Conventional Commits** — primarily `feat`, `fix`, `refactor`, `chore`,
`docs`. Example: `feat(renderer): add inertia decorator`.

## Conventions

- Keep core packages (`schema-model`, `dsl`, `transforms`) strictly DOM-free.
- The OWM-DSL round-trip must stay lossless; JSON serialization must be deterministic.
- Architecture details in [`docs/KONZEPT.md`](docs/KONZEPT.md).

## Code Style

- Write comments only when explicitly requested. Otherwise write self-explanatory code — descriptive
  function and parameter names, no abbreviations.
- If comments are needed: make them **WHY**-driven, not **HOW**.
