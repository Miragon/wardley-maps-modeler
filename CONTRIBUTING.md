# Contributing

Thanks for helping improve the Wardley Maps Modeler. This is a pnpm-workspace monorepo
(Node ≥ 20.19, pnpm 11, TypeScript ESM). Architecture lives in [`docs/KONZEPT.md`](docs/KONZEPT.md);
agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## Setup & inner loop

```bash
pnpm install
pnpm build      # builds packages/* (workspace deps resolve to dist — build before testing)
pnpm test       # vitest run
pnpm run lint   # eslint . + type-check (same check the pre-commit hook runs)
```

Useful extras: `pnpm dev:webapp`, `pnpm dev:vscode`, `pnpm depcruise` (module-graph check),
`pnpm format` (Prettier).

## Pre-commit reality

The Husky hook (`.husky/pre-commit`) runs **only** `lint-staged` + `pnpm run lint` — i.e. ESLint and
type-check. It does **not** run tests, the build, or dependency-cruiser. So before you push, run
`pnpm test` (and `pnpm depcruise` if you touched imports) yourself. `git commit --no-verify` bypasses
the hook — avoid it.

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/) — primarily `feat`, `fix`, `refactor`,
`chore`, `docs`.

```
feat(renderer): add inertia decorator
fix(dsl): keep url keyword on round-trip
docs: add contributing guide
```

## Monorepo map & the DOM boundary (P1)

| Package                 | Purpose                                               | DOM      |
| ----------------------- | ----------------------------------------------------- | -------- |
| `@wardley/schema-model` | Metamodel, Zod validation, JSON serialization         | DOM-free |
| `@wardley/dsl`          | OWM text DSL ↔ model (lossless round-trip)            | DOM-free |
| `@wardley/transforms`   | Pure `WardleyMap → WardleyMap` transforms             | DOM-free |
| `@wardley/renderer`     | diagram-js bootstrap, renderer, viewer, import/export | DOM      |
| `apps/webapp`           | Vite demo editor                                      | DOM      |
| `apps/vscode`           | VS Code custom editor for `.wmap`/`.owm`              | DOM      |

**P1 — the DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). This
is enforced twice — by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** by
dependency-cruiser — so a violating import fails `pnpm run lint` and `pnpm depcruise`.

Also keep the OWM-DSL round-trip lossless and JSON serialization deterministic.

## Pull requests

- Keep PRs small and focused.
- Make sure local gates are green: `pnpm run lint`, `pnpm test`, `pnpm depcruise`, `pnpm build`.
- Working on map/domain semantics? See the Wardley-mapping skill in
  [`.claude/skills/wardley-mapping/`](.claude/skills/wardley-mapping/).
