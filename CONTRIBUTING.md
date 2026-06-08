# Contributing

Thanks for helping improve the Wardley Maps Modeler. This is an npm-workspaces monorepo
(Node ≥ 22.13, npm, TypeScript ESM). Architecture lives in [`docs/KONZEPT.md`](docs/KONZEPT.md);
agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## Setup & inner loop

```bash
npm install
npm run build   # builds packages/* (workspace deps resolve to dist — build before testing)
npm test        # vitest run
npm run lint    # eslint . + type-check (same check the pre-commit hook runs)
```

Useful extras: `npm run dev:webapp`, `npm run dev:vscode`, `npm run depcruise` (module-graph check),
`npm run format` (Prettier).

## Browser & e2e tests

`npm run test:browser` (Vitest browser mode) and `npm run test:e2e` (Playwright, in `e2e/`) need a
Chromium browser. Locally, run `npx playwright install chromium` once. In CI these two jobs run inside
the official Playwright container (`mcr.microsoft.com/playwright`), which ships the browser + system
libs pre-installed — so **when you bump `@playwright/test` in `e2e/package.json`, bump the matching
image tag in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) too** (the version pin-check does
not catch this).

## Pre-commit reality

The Husky hook (`.husky/pre-commit`) runs **only** `lint-staged` + `npm run lint` — i.e. ESLint and
type-check. It does **not** run tests, the build, or dependency-cruiser. So before you push, run
`npm test` (and `npm run depcruise` if you touched imports) yourself. `git commit --no-verify` bypasses
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

| Package                         | Purpose                                               | DOM      |
| ------------------------------- | ----------------------------------------------------- | -------- |
| `@miragon/wardley-schema-model` | Metamodel, Zod validation, JSON serialization         | DOM-free |
| `@miragon/wardley-dsl`          | OWM text DSL ↔ model (lossless round-trip)            | DOM-free |
| `@miragon/wardley-transforms`   | Pure `WardleyMap → WardleyMap` transforms             | DOM-free |
| `@miragon/wardley-renderer`     | diagram-js bootstrap, renderer, viewer, import/export | DOM      |
| `apps/webapp`                   | Vite demo editor                                      | DOM      |
| `apps/vscode`                   | VS Code custom editor for `.wmap`/`.owm`              | DOM      |

**P1 — the DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). This
is enforced twice — by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** by
dependency-cruiser — so a violating import fails `npm run lint` and `npm run depcruise`.

Also keep the OWM-DSL round-trip lossless and JSON serialization deterministic.

## Pull requests

- Keep PRs small and focused.
- Make sure local gates are green: `npm run lint`, `npm test`, `npm run depcruise`, `npm run build`.
- Working on map/domain semantics? See the Wardley-mapping skill in
  [`.claude/skills/wardley-mapping/`](.claude/skills/wardley-mapping/).
