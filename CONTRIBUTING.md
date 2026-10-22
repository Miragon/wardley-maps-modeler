# Contributing

Thanks for helping improve the Wardley Maps Modeler. This is an npm-workspaces monorepo
(Node ≥ 22.22.2, npm, TypeScript ESM). Agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## External contributions

We're currently not accepting pull requests from outside the team. We don't have the resources to fully review and validate external contributions, so we can't guarantee that a merged change keeps the project free of bugs, free of security vulnerabilities or malicious code, and consistent with requirements that make sense for it. Pull requests opened by external contributors will be closed.

If you've found a bug or have an idea, please [open an issue](https://github.com/Miragon/wardley-maps-modeler/issues/new) instead. We read every one, and it's the best way to get something onto our radar.

## Setup & inner loop

```bash
npm install
npm run build   # builds packages/* (workspace deps resolve to dist — build before testing)
npm test        # vitest run
npm run lint    # eslint . + type-check (same check the pre-commit hook runs)
```

Useful extras: `npm run dev:webapp`, `npm run dev:vscode`, `npm run depcruise` (module-graph check),
`npm run format` (Prettier).

### Named local URL via Portless

`npm run dev:webapp` (and the top-level `npm run dev`) serves the webapp through
[Portless](https://portless.sh) at a stable, named `.localhost` URL instead of a Vite port
(needs **Node ≥ 24**). Portless is a pinned **devDependency**, so `npm install` is all you need — no
global install. Config lives in [`apps/webapp/portless.json`](apps/webapp/portless.json)
(`{ "name": "wardley", "script": "dev:app" }`): `npm run dev:webapp` runs bare `portless`, which
starts the real Vite server (the `dev:app` script) behind the proxy.

The URL is **per worktree** and Portless-derived — never hand-built: in a linked git worktree it
prepends the branch as a subdomain, so you get `https://<branch>.wardley.localhost` in a Conductor
workspace and `https://wardley.localhost` in the main checkout. Each worktree gets its own URL, so
parallel apps never collide. On start Portless **opens your browser** there and prints it as a
`➜ Portless:` line under Vite's output.

Portless needs an HTTPS proxy daemon on port 443, installed once per machine (it binds 443 and
trusts a local CA, so it needs **sudo** — which is also why Conductor's non-TTY Run button can't do
it for you):

```bash
npx portless trust            # add the local CA to your system trust store
npx portless service install  # run the HTTPS proxy as a background service (survives reboots)
```

Prefer a plain Vite server with no proxy? `npm run dev:webapp:plain` (or
`npm run dev:app -w apps/webapp`) runs Vite directly on `:5180` and needs none of the above.

## Browser & e2e tests

`npm run test:browser` (Vitest browser mode) and `npm run test:e2e` (Playwright, in `e2e/`) need a
Chromium browser. Locally, run `npx playwright install chromium` once. In CI these two jobs run inside
the official Playwright container (`mcr.microsoft.com/playwright`), which ships the browser + system
libs pre-installed — so **when you bump `@playwright/test` in `e2e/package.json`, bump the matching
image tag in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) too** (the version pin-check does
not catch this).

The Playwright config has two projects, each with its own dev server started for the run:

- `webapp` — the demo web app (`apps/webapp`, Vite on `E2E_PORT`, default `5180`). It runs the
  shell's conformance kit on the web host, the app's handlers behind the chrome and the modelling
  interactions.
- `vscode-webview` — the VS Code webview (`apps/vscode/src/webview/main.ts`) inside the VS Code
  stub of `@miragon/modeler-shell`, served by the test page in `e2e/webview/` (Vite on
  `E2E_WEBVIEW_PORT`, default `5190`). It runs the shell's conformance kit, the webview's side of
  the host protocol, and a smoke test of the production bundle behind the webview CSP.

Run one with `npx playwright test --project=vscode-webview` from `e2e/`. When the default ports are
taken (several worktrees at once), pick others: `E2E_PORT=6101 E2E_WEBVIEW_PORT=6111 npm run test:e2e`.

The renderer's browser tests also run the `@miragon/modeler-api` conformance kit against
`createCollaborativeModeler`/`createCollaborativeViewer`
([`conformance.browser.test.ts`](packages/renderer/test/browser/conformance.browser.test.ts)); a
skipped case fails the run.

## VS Code smoke test

`npm run test:vscode` (the `vscode` Vitest project in
[`apps/vscode/test/smoke/`](apps/vscode/test/smoke/), not part of `npm test`) checks the extension
in a real VS Code with `runVsCodeSmoke` of `@miragon/modeler-shell/testing/vscode-electron`. It packs
the extension as the release does (`vsce package --no-dependencies`, which runs `vscode:prepublish`,
the production build) and unpacks the VSIX into a temporary folder: no `node_modules` of the monorepo
sits next to the bundle there, so a module esbuild did not inline fails the activation as it would
for a user. VS Code starts with that folder on a throwaway profile, opens a small map
([`tea-shop.wmap`](apps/vscode/test/smoke/tea-shop.wmap)) in the custom editor, and the test checks
the chrome, evolves a component (click, Shift+→), saves (the file changes and
`parseDSLWithDiagnostics` finds nothing), undoes (canvas and file are back) and switches through
VS Code's four default themes, in which the webview stays light (`WEBVIEW_THEMES`) and high contrast
passes. A screenshot per theme goes to `test-results/vscode-smoke/` (git-ignored, emptied at the
start of every run): `wardley-light.png`, `wardley-dark.png`, `wardley-high-contrast-dark.png` and
`wardley-high-contrast-light.png`, or `wardley-open-failure.png` when the editor never opened. The
packages come from source, as in the extension's own build, so no `npm run build` is needed first.

On macOS:

```bash
npm run test:vscode                              # the newest stable VS Code
VSCODE_SMOKE_VERSION=1.96.0 npm run test:vscode  # another version, here the engines floor
VSCODE_SMOKE_KEEP=1 npm run test:vscode          # keeps VS Code's profile and logs, prints where
```

A VS Code window opens for a few seconds; a run takes about 5 s. The first run downloads VS Code
(about 320 to 360 MB, 0.9 GB unpacked per version) into
`~/Library/Caches/miragon-modeler-shell/vscode-test` (`~/.cache/…` on Linux), which every Miragon
modeler on the machine shares and `npm ci` keeps; let one download finish before starting a second
run. Like `npm run package -w apps/vscode`, the packing writes the production build into
`apps/vscode/dist`. On Linux, run it under an X server: `xvfb-run -a npm run test:vscode`.

When a failure names no cause (for example "the custom editor never showed the shell's menu"), the
cause is in VS Code's logs: run again with `VSCODE_SMOKE_KEEP=1` and read the `logs` folder of the
kept profile. One failure is retried, up to twice: the save step of `@miragon/modeler-shell` 0.3.0 can
read the file while VS Code writes it, and that empty read fails with `the map has no elements`. The
reporter marks such a run `(retry x1)`; every other failure fails at once.

In CI, [`.github/workflows/vscode-smoke.yml`](.github/workflows/vscode-smoke.yml) runs it on
`ubuntu-latest` under `xvfb-run -a`: weekly on Monday, on demand (Actions → VS Code smoke → Run
workflow, optionally with a VS Code version) and on pull requests that change `apps/vscode/**`, the
sources of the extension host's bundle (`packages/dsl`, `packages/schema-model`),
`package-lock.json`, or the test's setup (`package.json`, `vitest.config.ts`,
`.github/actions/setup`). It is a workflow of its own and not a required check, so it never delays or
blocks the CI workflow. The downloaded VS Code is cached per version. The screenshots are uploaded as
the `vscode-smoke` artifact and, when the run failed, VS Code's logs as `vscode-smoke-logs` (7 days
each).

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
  Changed the extension, the DSL, the schema model or a dependency? Run `npm run test:vscode` too.
- Working on map/domain semantics? See the `wardley-mapping` and `owm-dsl` skills of the Claude Code
  plugin in [`plugins/wardley-maps-modeler/`](plugins/wardley-maps-modeler/). Changed the DSL? Keep
  the `owm-dsl` skill and its examples in step — `npm test` parses every example in the plugin.
