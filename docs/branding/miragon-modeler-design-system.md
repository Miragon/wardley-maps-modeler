# Miragon Modeler Design System

A portable UI/UX + branding guide for Miragon's **diagram-js–based modeler** tools (e.g. the Wardley
Maps modeler, the Team-Topologies modeler, BPMN / DMN / Form editors …). The goal is that every
Miragon modeler _feels like one product family_: same colours, same typography, same
page/dialog/feedback patterns — while each keeps its own domain notation on the canvas.

It is written to be **copied into any modeler repo** and applied. A worked reference implementation
(with concrete file paths) is listed at the end.

> **Source of truth for the brand:** the official
> [**`Miragon/corporate-identity`**](https://github.com/Miragon/corporate-identity) repo —
> specifically `brand/tokens.json` (the machine-readable `--cd-*` tokens) and its logo/font assets.
> The values below mirror that repo. If the CI changes, update `brand/tokens.json` upstream, then the
> token tables here, then the code that mirrors them.

---

## 1. Design principles

1. **Minimal, technical, precise.** Restrained colour, generous whitespace, content first. The
   map/diagram is the hero; chrome recedes. The typeface (Geist) sets a precise, modern tone.
2. **Full-bleed canvas + floating chrome.** No header bar. The canvas fills the viewport; controls
   float over it (Excalidraw style). See §5.
3. **Blue leads, green accents.** Blue (`blau`) carries interaction — buttons, links, focus,
   selection. Green (`gruen`) is the accent — key visual, highlights, one emphasised word, the brand
   gradient. Green is **never** body text on white. See §3.
4. **The brand moment is the blue→green gradient.** Use it for hero surfaces / brand marks, sparingly.
5. **One light mode — no dark theme.** The CI defines none, and a light "paper" plot on a dark
   surround reads poorly, so a modeler ships a single mode (not labelled "light" or "dark"). A genuine
   dark canvas needs a true dark _plot_ (§10) — a deliberate, larger undertaking, not a token flip.
6. **Colour is never the only signal.** Pair it with shape, icon, text, or position (accessibility).
7. **Single source of truth for tokens.** Define each colour once; mirror it into CSS and any
   canvas-drawing code; guard the mirror with a test. See §13.

---

## 2. Brand foundations

- **Logo:** the Miragon **wordmark** + the **"Komet"** icon mark (files in the CI repo under
  `docs/public/logo/`: `miragon-logo-{gruen,blau,schwarz,weiss}.svg`,
  `miragon-komet-{gruen,blau}.svg`). Variants: **gruen is default**; `weiss` on colour/photo; `schwarz`
  monochrome. Min size: wordmark 96px web / 20mm print; Komet 24px / 8mm. Clearspace = height of the
  letter "M". For a small square app mark, prefer the **brand gradient** with a white glyph.
- **Blue leads.** `blau #335DE5` is the primary (surfaces, buttons, backgrounds). For **link/accent
  text on white**, use the deeper `blau-link #2B50D4` (WCAG AA ~5.5:1). On dark surfaces (the opt-in
  "dark map") use `blau-hell #6B8AFF`.
- **Green accents.** `gruen #00E676` — key visual, highlights. A fill/indicator colour, never text on
  white (fails WCAG). Reserve it for brand moments (the gradient, the mark) and "positive" signals.
- **Voice:** concise, direct, English. Sentence case for UI labels ("Show example").

---

## 3. Colour system

### 3.1 Brand palette (`brand/tokens.json`)

| Token       | Value     | `--cd-*`         | Role                                                   |
| ----------- | --------- | ---------------- | ------------------------------------------------------ |
| `blau`      | `#335DE5` | `--cd-blau`      | **Primary** — surfaces, buttons, backgrounds           |
| `blau-link` | `#2B50D4` | `--cd-blau-link` | Interactive text / links / focus (AA on white)         |
| `blau-hell` | `#6B8AFF` | `--cd-blau-hell` | Interactive on **dark** surfaces (opt-in dark map)     |
| `gruen`     | `#00E676` | `--cd-gruen`     | **Accent** — key visual, highlights (a fill, not text) |
| `grau`      | `#F9F7F7` | `--cd-grau`      | Calm neutral surface (warm off-white)                  |
| `schwarz`   | `#1D1D1D` | `--cd-schwarz`   | Text on light, monochrome logo (not pure black)        |
| `weiss`     | `#FFFFFF` | `--cd-weiss`     | Text on colour, surfaces                               |

Dark base (from the CI hero / nav-glass): **`#080A20`**.

### 3.2 Functional (status) layer — separate from the brand palette

Only for states (success/warning/error/info) in UI and diagrams; each is AA as text on white, each has
a `-soft` background tint at 12 % alpha.

| Meaning | Value     | `-soft`                |
| ------- | --------- | ---------------------- |
| success | `#0B7A55` | `rgba(11,122,85,0.12)` |
| warning | `#92610A` | `rgba(146,97,10,0.12)` |
| danger  | `#C92A2A` | `rgba(201,42,42,0.12)` |
| info    | `#2B50D4` | `rgba(43,80,212,0.12)` |

### 3.3 Gradient (the brand moment — use verbatim, don't rebuild by eye)

```
--cd-gradient-brand:  linear-gradient(120deg, #335DE5 30%, #00E676);   /* hero, brand marks */
--cd-gradient-format: linear-gradient(135deg, #335DE5 0%, #00E676 140%); /* social/format tiles */
```

### 3.4 No dark theme (single mode)

The CI is a **light system** — it defines no dark content theme (its only dark surface is the home
hero base `#080A20`). Ship a **single mode**: don't build a light/dark toggle, and don't label the app
"light" or "dark". Two reasons: it matches the CI, and the honest alternative reads poorly — a light
"paper" plot on a dark surround glares, and a truly dark canvas needs a dark _plot_, which is a
separate undertaking (see §10). `blau-hell #6B8AFF` and `#080A20` exist only for the rare surfaces that
are genuinely dark (e.g. an opt-in per-document "dark map" style), never for a global theme.

### 3.5 Mapping domain semantics onto the palette

A modeler's canvas has its own meaningful colours. Map them onto the palette, keep distinctions
legible, and back colour with shape. Worked example — the Wardley modeler:

| Domain concept          | Colour            | Rationale                    |
| ----------------------- | ----------------- | ---------------------------- |
| flow / interactive edge | `blau #335DE5`    | interactive / value flow     |
| accelerator (speed up)  | green `#00C853`   | positive / "go"              |
| movement, deaccelerator | `danger #C92A2A`  | change urgency / risk        |
| dependency edge         | neutral `#9E9E9E` | structural, recedes          |
| attitude: pioneers      | `blau #335DE5`    | explore                      |
| attitude: settlers      | `warning #92610A` | stabilise                    |
| attitude: town planners | green `#00C853`   | industrialise                |
| note swatches (8)       | functional + hues | semantic convention, legible |

**Rule:** if a colour is rendered as text or a thin stroke, use the darker functional value (≥ 4.5:1);
the bright brand green is a fill, not a text colour.

### 3.6 Accessibility of colour

- Body/label text ≥ 4.5:1; large text / non-text UI ≥ 3:1.
- `gruen` fails as text on white — fills/indicators only. Use `blau-link` for interactive text.
- Never rely on hue alone (selection = blue outline + emphasis; toast = colour + icon + wording).

---

## 4. Typography

**Geist** (the Miragon typeface — Vercel, SIL Open Font License) for everything, **Geist Mono** for
code/fixed measures. Self-hosted variable fonts — **no CDN** (offline & GDPR). One variable file covers
all weights (100–900).

| Style | Size / weight / line-height             |
| ----- | --------------------------------------- |
| h1    | 40px / 700 / 1.1                        |
| h2    | 28px / 700 / 1.2                        |
| h3    | 21px / 600 / 1.3                        |
| lead  | 20px / 400 / 1.5                        |
| body  | 16px / 400 / 1.6 (min for good reading) |
| klein | 13px / 400 / 1.5                        |

**Canvas caveat:** SVG `<text>` needs the family as a presentation attribute (it does not inherit a CSS
container font). Set `font-family: 'Geist', …` directly on text nodes so the on-screen canvas _and_
exported SVG/PNG render in Geist when the consumer has loaded it; fall back to a system sans.

```
@import '@fontsource-variable/geist/wght.css';
@import '@fontsource-variable/geist-mono/wght.css';
```

---

## 5. Spacing & layout

- **8-point grid** with 4 as the fine step: `4 · 8 · 16 · 24 · 32 · 48 · 64 · 96`.
- **Layout grid:** 12 columns, 24px gutter, max content width 1152px.
- **App shell = full-bleed canvas + floating chrome, no header bar.** Anchor chrome to the corners:

  | Position          | Content                                |
  | ----------------- | -------------------------------------- |
  | top-left          | Menu (hamburger → dropdown)            |
  | top-center        | Tool palette (from the renderer)       |
  | top-right         | Primary action(s) (e.g. Share)         |
  | right / on-select | Inspector / properties (when relevant) |
  | bottom-right      | Zoom controls                          |
  | bottom-left       | Legal / operator links                 |
  | bottom-center     | Toasts                                 |

- Chrome sits 12–16px off each edge; leave a top inset (~90px) when fitting the map.
- **z-index layers:** canvas `0`, chrome `20–40`, modals `50`, toasts `60`.

---

## 6. Shape & elevation

**Radii (CI):** `sm 6px` (badges, chips) · **`md 12px` (standard: buttons, inputs, cards)** ·
`lg 16px` (large panels/tiles) · `pill 999px` (pills, avatars). Default to `md`.

**Elevation** — soft, low-alpha, tinted with brand black (not pure black):

```
--cd-shadow-1: 0 1px 2px rgba(29,29,29,.06), 0 1px 3px rgba(29,29,29,.10);  /* subtle */
--cd-shadow-2: 0 4px 12px rgba(29,29,29,.10);                               /* cards */
--cd-shadow-3: 0 12px 32px rgba(29,29,29,.16);                             /* popovers, dialogs */
```

Borders `1px solid` the line token. Cards over the canvas may use a translucent surface +
`backdrop-filter: blur(8px)`.

---

## 7. Motion

- **Durations (CI):** `fast 150ms` (hover), `base 250ms` (standard), `slow 400ms` (large in/out).
- **Easing (CI):** `--cd-ease: cubic-bezier(.4,0,.2,1)`, `--cd-ease-out: cubic-bezier(0,0,.2,1)`
  (for elements entering).
- Hover-lift on primary buttons (`translateY(-1px)` + stronger shadow); menus/toasts/cards fade+slide.
- Always honour reduced motion:

```
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important; animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
```

---

## 8. Components

**Buttons** (radius `md 12px`, weight 600)

- _Primary_: `blau` fill, white text, `shadow-1`; hover → `blau-link` + `shadow-2` + lift. This is the
  default for the main action (e.g. Share, Get started).
- _Secondary / ghost_: `surface` fill, line border, `schwarz` text; hover → blue border/text +
  `blau`-soft background.
- _Icon button_ (chrome): `surface`, line, `shadow-1`; hover blue.
- Green is **not** a button fill — reserve it for the gradient mark / highlights.
- States: `:active` press, `:focus-visible` blue ring, `:disabled` 0.5 opacity + `not-allowed`.

**Menus / dropdowns** — `surface`, `md`, `shadow-3`, 6px padding; items `sm`, hover blue-soft; pop-in;
close on outside-click and `Escape`.

**Dialogs / modals** — dimmed backdrop `rgba(8,10,32,.42)` + blur; centered panel `surface` / `md` /
`shadow-3`; header (600) + close; right-aligned footer. Close on backdrop + `Escape`; trap + restore
focus.

**Inputs / fields** — `surface-2` fill, line border, `sm`/`md`; `:focus` → blue border + blue-soft ring.

**Toasts** — bottom-center; `surface` card, coloured **left border + dot** using the functional colours
(success/danger/info) **and** text; `role="status"`, `aria-live="polite"`; auto-dismiss (~2.8s, errors
~5s); slide+fade.

**Empty / landing state** — a start screen when the canvas is empty and untouched: a centered
translucent card with the **Miragon icon**, a `600` title, one line of help, and exactly two actions —
a **blue** primary "New diagram" + a ghost "Show example" (plus a subtle drag-&-drop hint). It **hides
the working chrome** (palette, menu, share, zoom) — only the card shows — and reveals the chrome once
the user starts (new / example / open). Nothing else competes for attention on first run.

**Palette / context-pad (diagram-js)** — floating `surface` toolbar with WYSIWYG icons; hover blue.
Keep these **light** (they overlay the paper plot — §10) so the icons stay legible.

---

## 9. Feedback & states

| State       | Pattern                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| success     | green-`success` toast (link copied, saved)                               |
| error       | `danger` toast with the message (never a silent `console` / `alert`)     |
| info/warn   | `info`/`warning` toast (e.g. "Imported with N warning(s) — see console") |
| empty       | empty-state card with a blue CTA                                         |
| drag-over   | dashed `blau` border + blue-soft fill + "Drop … here"                    |
| loading     | spinner/skeleton for any async work (avoid a frozen canvas)              |
| disabled    | 0.5 opacity, `cursor: not-allowed`, no hover                             |
| destructive | confirm before irreversible actions (replace/clear)                      |

---

## 10. Canvas / diagram

- **Surround vs. plot.** The surround carries the paper colour + a subtle dot-grid; the **plot area
  stays light "paper"**. The whole canvas is light — that's the single mode.
- **Why light-only:** map contents are SVG presentation attributes; keeping them light means **SVG/PNG
  exports are stable, printable, and shareable**, and it sidesteps the glare of a white plot on a dark
  surround.
- Grid/axis neutral greys; selection/hover use the blue accent (outline), keeping user element colours.
- **If you ever need a true dark canvas:** it means darkening the _plot_ too (not just the surround) —
  resolve the canvas colour set at render time and force the light set during export so shared images
  never drift dark. This is a deliberate feature, not a token flip; it's why the default is one mode.

---

## 11. Iconography

- Line/solid icons on a 24px grid (Material Icons work well). Draw with `fill="currentColor"` so they
  inherit `schwarz`/`blau`. Stroke ~1.5–2.2, round caps/joins.
- Chrome icons 16px; palette/canvas previews 24px, WYSIWYG.
- App icon / favicon / empty-state mark: the **official Miragon icon** — the green Komet on a blue
  rounded square (CI repo: `docs/public/icon-512.png`, `favicon-*.png`, `logo/miragon-komet-*.svg`).
  Reuse it verbatim; don't invent a new mark.

---

## 12. Accessibility checklist

- [ ] Text ≥ 4.5:1 (≥ 3:1 large / non-text).
- [ ] Visible `:focus-visible` ring on every interactive element.
- [ ] Keyboard path; `Escape` closes menus/dialogs; focus trap + restore in modals.
- [ ] Colour never the sole signal.
- [ ] `prefers-reduced-motion` respected.
- [ ] `aria-live` toasts; `aria-expanded`/`aria-haspopup` on menu triggers.

---

## 13. Applying this to a diagram-js modeler

**Token architecture (single source of truth).** diagram-js modelers colour two layers: **CSS**
(chrome) and **inline SVG attributes** (the diagram). Keep both from one place:

1. A **pure-TS token module** (no DOM) exporting the palette + the canvas colour set, mirroring the CI
   `brand/tokens.json`. Derive the SVG colour constants from it.
2. **CSS `:root`** (one mode) that mirrors those values.
3. A **unit test** that reads the CSS and asserts the `:root` variables equal the TS token values.

**One mode.** No `data-theme` switch, no light/dark toggle (§3.4). The only dark surface is an opt-in
per-document "dark map" directive, if the modeler's format has one — keep it independent and drop it
if it doesn't.

**Checklist**

- [ ] Add `@fontsource-variable/geist` (+ `geist-mono` where code is shown); set the canvas
      `font-family` to Geist; update READMEs.
- [ ] Create the token module from `brand/tokens.json`; derive the SVG colour constants; re-export
      tokens from the package entry (no new cross-package dependency edge).
- [ ] Author `:root`; replace hardcoded hex/rgba with vars.
- [ ] Map domain colours (§3.5), keeping text/stroke colours ≥ 4.5:1.
- [ ] Restyle chrome: blue primary buttons (md), menus, dialogs, inputs, zoom (§6, §8); gradient mark.
- [ ] Add the toast system routed through the functional colours (§9).
- [ ] Keep the canvas light; keep exports light (§10).
- [ ] Add the drift test; run build + lint + tests; verify visually + an export.

### Token appendix

**Don't re-type the `--cd-*` values here** — that would fork the brand and drift from source. Pull the
canonical, generated token file from the CI repo and ship it as-is:

`Miragon/corporate-identity` → `docs/.vitepress/theme/tokens.generated.css` (all `--cd-*` colours,
radii, shadows, motion; generated from `brand/tokens.json`). Vendor that file, then define **only your
app-specific semantic aliases** on top of it (these are yours, not the CI's):

```css
/* Vendored from Miragon/corporate-identity — do not edit; re-pull to update. */
@import './cd-tokens.generated.css';

/* App-level semantic aliases (map --cd-* to app tokens). One mode — no dark override. */
:root {
  --paper: var(--cd-grau);
  --surface: var(--cd-weiss);
  --ink: var(--cd-schwarz);
  --line: #e6e2e2;
  --accent: var(--cd-blau); /* button fill */
  --accent-ink: var(--cd-blau-link); /* links / focus / hover text (AA) */
  --brand: var(--cd-gruen);
  color-scheme: light;
}
```

The §3 tables above are a **human-readable snapshot** for reviewers; the `.generated.css` file is the
value source of truth.

> **Reference implementation (this repo):** tokens `packages/renderer/src/theme/palette.ts` ·
> drift test `packages/renderer/test/theme.sync.test.ts` · canvas colours
> `packages/renderer/src/draw/styles.ts` · in-canvas chrome `packages/renderer/src/assets/wardley.css`
> · app chrome + toast `apps/webapp/src/{style.css,toast.ts,main.ts}` ·
> VS Code webview `apps/vscode/src/webview/style.css`.
