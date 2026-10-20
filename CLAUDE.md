# CLAUDE.md

TypeScript library for viewing and editing [Wardley Maps](https://learnwardleymapping.com/),
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets:
a web app and a VS Code extension.

## Monorepo (npm workspaces)

Workspaces are declared in the root `package.json` (`workspaces` array, listed in topological
build order). **All** versions are pinned to exact values inline in each package's `package.json`
(`.npmrc` sets `save-exact=true`) — including internal `@miragon/wardley-*` deps, which pin to the
**current version of that workspace package** (e.g. `"@miragon/wardley-dsl": "0.6.0"`; npm links them
to the local workspace because the local version satisfies the pin, and the release PR bumps them).
Exact pinning is enforced in CI by
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
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`); of
`@miragon/modeler-api` they may import types only. No package under `packages/` imports
`@miragon/modeler-shell` — the shared modeler chrome belongs to the apps. Enforced twice — ESLint
(`no-restricted-imports`/`no-restricted-globals`) **and** `dependency-cruiser` — so a violating
import fails `npm run lint` and `npm run depcruise`.

**Contract and shell:** the renderer implements the
[`@miragon/modeler-api`](https://github.com/Miragon/modeler-api) collaborative-modeler contract
(`createCollaborativeModeler`/`createCollaborativeViewer` in
[`packages/renderer/src/collaborative/`](packages/renderer/src/collaborative/)); its conformance kit
runs in the browser tests
([`conformance.browser.test.ts`](packages/renderer/test/browser/conformance.browser.test.ts)), and a
skipped case fails the run. The VS Code webview mounts `@miragon/modeler-shell`
([`apps/vscode/src/webview/main.ts`](apps/vscode/src/webview/main.ts)), the web app mounts its web
host ([`apps/webapp/src/main.ts`](apps/webapp/src/main.ts)); the shell's conformance kit runs
against both, in the `vscode-webview` Playwright project (`e2e/tests/vscode/`) and in the `webapp`
project (`e2e/tests/webapp-shell-conformance.spec.ts`).

## Commands

- `npm run build` — all packages · `npm run build:webapp` (then `npm run check:build -w apps/webapp`
  checks the mode markup and licence comment it ships) · `npm run build:vscode`
- `npm run dev:webapp` (alias: `npm run dev`) serves the webapp via [Portless](https://portless.sh)
  at a per-worktree `https://<branch>.wardley.localhost` URL (Portless-derived from the git worktree;
  config in [`apps/webapp/portless.json`](apps/webapp/portless.json); one-time `npx portless service
install` — see [`CONTRIBUTING.md`](CONTRIBUTING.md)). `npm run dev:webapp:plain` for plain Vite on
  `:5180`. · `npm run dev:vscode`
- `npm test` — Vitest · `npm run test:browser` — Vitest browser mode · `npm run typecheck` ·
  `npm run lint` (ESLint + typecheck)
- `npm run test:e2e` — Playwright, two projects: `webapp` and `vscode-webview` (ports `E2E_PORT`,
  default 5180, and `E2E_WEBVIEW_PORT`, default 5190)
- `npm run format` — Prettier · `npm run depcruise` — check the module graph

Requirements: Node ≥ 22.22.2, npm. Build packages before running tests (workspace deps resolve to
`dist`). The Husky pre-commit hook runs **only** lint-staged + `npm run lint` (ESLint + type-check) —
**not** tests/build/depcruise; run `npm test` yourself before pushing.

## Git

Everything is managed via **Conventional Commits** — primarily `feat`, `fix`, `refactor`, `chore`,
`docs`. Example: `feat(renderer): add inertia decorator`.

## Releases

Every package is released on its own, driven by
[release-please](https://github.com/googleapis/release-please) on push to `main`
([`.github/workflows/release-please.yml`](.github/workflows/release-please.yml)). The config
([`release-please-config.json`](release-please-config.json)) makes each workspace a **component**
of its own (`schema-model`, `dsl`, `transforms`, `renderer`, `vscode`, `webapp`), and
[`.release-please-manifest.json`](.release-please-manifest.json) holds each one's current version.
All pending releases share one release PR (`separate-pull-requests: false`).

- **What gets bumped:** each component whose directory a commit touches. `feat` bumps the minor and
  `fix` the patch; while a version is `0.x`, a breaking change bumps the minor as well
  (`bump-minor-pre-major`). `chore`, `ci`, `docs`, `test` and `refactor` commits release nothing.
- **Internal dependencies:** the `node-workspace` plugin bumps every `@miragon/wardley-*` reference
  (`dependencies`, and `peerDependencies` via `updatePeerDependencies`) to the new version and gives
  each dependent a patch release with a "Dependencies" entry. A new internal dependency edge needs no
  release config.
- **Merging the release PR** tags each released component as `<component>-vX.Y.Z` (e.g.
  `renderer-v0.7.0`, `vscode-v0.8.0`; `include-component-in-tag: true`), creates its GitHub release,
  writes its entry to the component's own `CHANGELOG.md` (`packages/*/CHANGELOG.md`,
  `apps/*/CHANGELOG.md`; edit them in the release PR before merging), publishes the released
  `packages/*` libraries to npm, and the VS Code extension to the Marketplace and Open VSX. The web
  app is not published; Netlify deploys `main` ([`netlify.toml`](netlify.toml)). A manual run with
  `dry_run` builds, packs the libraries and packages the VSIX without releasing anything.
- **A new package** needs an entry under `packages` in `release-please-config.json`, its version in
  `.release-please-manifest.json`, and a publish job in `release-please.yml` if it ships.

The root [`CHANGELOG.md`](CHANGELOG.md) is the history of the former shared version (up to `v0.5.0`)
and is no longer written.

## Conventions

- Keep core packages (`schema-model`, `dsl`, `transforms`) strictly DOM-free (P1, above).
- The OWM-DSL round-trip must stay lossless; JSON serialization must be deterministic.
- Pin `dependencies` and `devDependencies` to exact versions — no version ranges (`^`/`~`/`>=`/`*`),
  internal workspace deps included (pinned to that package's current version, bumped by
  release-please's `node-workspace` plugin). CI-enforced via `miragon/pin-npm-dependencies` (which
  checks `dependencies` and `devDependencies`, not `peerDependencies`). **`peerDependencies` are the exception: consumer-shared
  runtime libs (`zod`, the `diagram-js`/`didi`/`tiny-svg` ecosystem) are declared as ranged peers so
  they dedupe against the consumer's copy instead of installing a second — duplicate `zod`/diagram-js
  instances break `instanceof`/schema identity and the DI injector. Each such peer is mirrored by an
  exact `devDependency` for local build/test, and the bundling apps (`webapp`, `vscode`) provide them
  as exact `dependencies`.** See
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- The repo's Claude skills ship as the **`wardley-maps-modeler` plugin**
  ([`plugins/wardley-maps-modeler/`](plugins/wardley-maps-modeler/)) via the marketplace in
  [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json): `wardley-mapping` for
  domain work (method, doctrine, creating and reviewing maps), `owm-dsl` for the `.wmap`/`.owm`
  text format (grammar, coordinates, round-trip, diagnostics). Install once with
  `/plugin marketplace add Miragon/wardley-maps-modeler` and
  `/plugin install wardley-maps-modeler@wardley-maps`; the skill files are readable directly under
  `plugins/wardley-maps-modeler/skills/` either way. Keep the skills repo-independent — they also
  run in other repositories and in Miragon AI Design, where Claude writes the map file directly and
  the modeler renders it. Drift tests guard them:
  [`packages/dsl/test/skill-examples.test.ts`](packages/dsl/test/skill-examples.test.ts) parses
  every `owm`-tagged code block and every `*.wmap`/`*.owm` under `plugins/wardley-maps-modeler/`
  (zero diagnostics, stable round-trip), and
  [`packages/renderer/test/skill-note-colors.sync.test.ts`](packages/renderer/test/skill-note-colors.sync.test.ts)
  keeps the documented note colours equal to `NOTE_COLORS` in
  [`packages/renderer/src/draw/styles.ts`](packages/renderer/src/draw/styles.ts). Bump `version`
  in the plugin's `plugin.json` and the marketplace entry together.
- Contributor onboarding in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Design system (mandatory)

All UI/visual work in this repo MUST follow the Miragon product design system. This is not optional.
Source of truth: the `miragon-brand:modeler-tool-design` Claude skill in
[Miragon/corporate-identity](https://github.com/Miragon/corporate-identity). If the plugin is
installed, the skill auto-loads on UI work; otherwise read the guide directly:
https://raw.githubusercontent.com/Miragon/corporate-identity/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md

Install once: `/plugin marketplace add Miragon/corporate-identity` then
`/plugin install miragon-brand@miragon`.

The skill's design-system files are vendored **verbatim** (guide 1.13.0) into
[`packages/renderer/src/theme/`](packages/renderer/src/theme/): `cd-tokens.generated.css`,
`cd-tokens.generated.json` and `cd-canvas.css` — do not fork hex values or edit them; re-copy from
the skill to update. Reference implementation in this repo: tokens
[`packages/renderer/src/theme/palette.ts`](packages/renderer/src/theme/palette.ts) · drift test
[`packages/renderer/test/theme.sync.test.ts`](packages/renderer/test/theme.sync.test.ts) (also: the
in-canvas chrome uses only `--cd-ui-*`/`--cd-shell-*` roles, no colour literals, overlays at most
z-index 100) · canvas colours [`packages/renderer/src/draw/styles.ts`](packages/renderer/src/draw/styles.ts)
· in-canvas chrome [`packages/renderer/src/assets/wardley.css`](packages/renderer/src/assets/wardley.css)
· web app and VS Code webview: the chrome of `@miragon/modeler-shell` (light only: `THEMES` in
[`apps/webapp/src/themes.ts`](apps/webapp/src/themes.ts) and `WEBVIEW_THEMES` in
[`apps/vscode/src/themes.ts`](apps/vscode/src/themes.ts), kept equal by a unit test; `style dark`
round-trips but is never painted), its sizes checked by
[`apps/vscode/test/tokens.sync.test.ts`](apps/vscode/test/tokens.sync.test.ts); the web app's own
content is the map-as-text dialogs and the start screen's empty canvas
([`apps/webapp/src/style.css`](apps/webapp/src/style.css)).

## Code Style

- Write comments only when explicitly requested. Otherwise write self-explanatory code — descriptive
  function and parameter names, no abbreviations.
- If comments are needed: make them **WHY**-driven, not **HOW**.
