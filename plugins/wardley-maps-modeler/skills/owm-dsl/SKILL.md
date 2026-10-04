---
name: owm-dsl
description: >-
  The OWM text format for Wardley Maps (`.wmap` / `.owm`) read and written by the Wardley Maps
  Modeler and `@miragon/wardley-dsl`: full grammar (anchor, component, `->` / `+>` links, evolve,
  pipeline, note, annotation, pioneers / settlers / townplanners, accelerator, submap, url, axis
  config), `[visibility, maturity]` coordinates and stage boundaries, the `(build|buy|outsource)`
  `(market)` `(ecosystem)` `inertia` `(color …)` `label [dx, dy]` suffixes, layout and note
  colours, parser diagnostics and the pitfalls that silently drop links, the round-trip guarantee
  and web-app share links. Use whenever reading, writing, generating, editing, validating or
  debugging a `.wmap` / `.owm` file or map text, placing components, building a share link, or
  calling `parseDSL` / `serializeDSL`. For the mapping _method_ (creating a map from a strategic
  question, reviews, doctrine, gameplay) use the `wardley-mapping` skill.
---

# The OWM map format (`.wmap` / `.owm`)

`.wmap` and `.owm` files are plain text in the Online Wardley Maps (OWM) DSL, read and written by
[`@miragon/wardley-dsl`](https://www.npmjs.com/package/@miragon/wardley-dsl). It is line-based: one
statement per line, names may contain spaces, indentation does not matter. A map is a flat list of
config lines, element declarations, `evolve` lines and links — plus one nested form, the pipeline
block `{ … }`.

**The file is the map.** The Wardley Maps Modeler — the web app
(https://wardley-maps.modeler.miragon.io), the VS Code extension
(`miragon-gmbh.wardley-mapping-modeler`) and Miragon AI Design — renders whatever the file says.
Your job is to write correct text into the `.wmap` / `.owm` file. Never draw the map yourself
(no SVG, HTML, React or image): the Modeler does that, and a hand-drawn picture cannot be edited.

Two properties make the format safe to generate — each with a sharp edge:

- **Parsing keeps what it does not understand.** An unreadable or unknown line is kept verbatim
  (`rawPassthrough`) and written back, so a mistake never destroys the rest of the map. But it is
  _silent_ for unknown keywords — `compnent X [0.5, 0.5]` produces no diagnostic and no component —
  a few mistakes lose text outright (anything after a `{` that opens a pipeline block is deleted,
  not kept), and parsing **can throw**: a link to a pipeline that has no range kills the whole
  file (see "Rules that bite"). A file that throws does not open in the Modeler at all.
- **Serializing is deterministic and canonical text is a fixed point.** `serializeDSL(parseDSL(t))`
  produces canonical text, and a second pass is byte-identical — for every clean file: zero
  diagnostics, nothing but comments left in `rawPassthrough`, no stray text after the coordinates
  of a `note` or `pipeline`, and no `(color …)` inside note or pipeline text. Text you write in
  canonical form comes back unchanged.

Scope: this skill is about the **format**. Where a component belongs, how evolved it is and what a
good map says is the `wardley-mapping` skill's job.

## The grammar on one page

### Config — at most one of each (a repeated line overrides the earlier one)

| Line                                           | Meaning                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `title <free text>`                            | Map title. Absent ⇒ `Untitled Map`.                                        |
| `style wardley\|handwritten\|colour\|dark`     | Visual style. Optional.                                                    |
| `size [width, height]`                         | Plot size in px. Default `1080 × 680`, minimum `480 × 320`.                |
| `evolution <g>-><c>-><p>-><u>`                 | Exactly four x-axis stage labels, renaming the four stage bands.           |
| `y-axis <label>` or `<label>-><bottom>-><top>` | Y-axis label, optionally with its end labels.                              |
| `annotations [vis, mat]`                       | Position of the annotation legend (kept; the Modeler draws no legend box). |

### Elements

```text
anchor        <Name> [vis, mat] (color …) label [dx, dy]
component     <Name> [vis, mat] (market, ecosystem, build|buy|outsource) inertia (color …) label [dx, dy]
note          <Text> [vis, mat] (color …)
annotation    <n> [vis, mat] <text>
annotation    <n> [[vis, mat], [vis, mat], …] (color …) <text>
pipeline      <Name> [matStart, matEnd] (color …) (y <vis>)
pioneers      [vis1, mat1, vis2, mat2] (color …)        also: settlers, townplanners
accelerator   <Name> [vis, mat] (color …)               also: deaccelerator
submap        <Name> [vis, mat] (color …) url(<Def>)
url           <Def> [<address>]
line          [[vis, mat], [vis, mat], …] (closed) (dashed|dotted) (color …)
evolve        <Name> <targetMat> (build|buy|outsource) label [dx, dy]
evolve        <Name>-><New Name> <targetMat>
```

| Keyword                                | Draws                                                 | Notes                                                  |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `anchor`                               | The user / customer (person icon)                     | Top of the map. Link endpoint.                         |
| `component`                            | A capability (circle)                                 | The workhorse. Link endpoint.                          |
| `note`                                 | Free text, centred on its coordinate                  | Review feedback with `(color …)`. Not a link endpoint. |
| `annotation` / `annotations`           | Numbered marker with text beside it / legend position | Prefer `note` for new feedback.                        |
| `pipeline`                             | A dashed box spanning a maturity range                | Needs a range — see "Rules that bite".                 |
| `evolve`                               | Red dashed arrow to the target maturity, same height  | Refers to an existing `component` by name.             |
| `pioneers` `settlers` `townplanners`   | Translucent team region between two corners           | Drawn behind everything.                               |
| `accelerator` / `deaccelerator`        | Market force that speeds up / slows down evolution    | Link endpoint.                                         |
| `submap`                               | A component that stands for another map               | Link endpoint; `url(…)` points at the other map.       |
| `url`                                  | A named address, referenced by `url(<Def>)`           | Must be referenced, or it stays an unused line.        |
| `line`                                 | Freeform polyline / polygon                           | Modeler extension.                                     |
| `market` / `ecosystem`                 | Legacy for `component … (market)` / `(ecosystem)`     | Rewritten as `component` on save.                      |
| `build` / `buy` / `outsource` `<Name>` | Legacy: sets the method on an existing component      | Rewritten as a `(…)` decorator on save.                |

### Pipeline block

```text
component Kettle [0.43, 0.6]
pipeline Kettle [0.25, 0.92]
{
  component Campfire Kettle [0.3]
  component Electric Kettle [0.82] (buy)
}
```

A pipeline named like a component is anchored to it and takes its height. Block children carry
**one** number — their maturity — and inherit the pipeline's height. They are ordinary components:
link to them, `evolve` them.

### Links

```text
<From> -> <To>                    dependency: From needs To (From sits above To)
<From> -> <To>; <annotation>      with a label at the midpoint
<From> +> <To>                    flow, arrow From → To
<From> +<> <To>                   flow in both directions
<From> +< <To>                    flow To → From (saved as To +> From)
<From> +'<value>'> <To>           flow with a value, e.g. +'£5'>; also +'<value>'<>
```

Endpoints are referenced **by exact name**: anchors, components (including pipeline children),
accelerators, submaps and standalone pipelines. Notes, annotations, regions and drawings are
never endpoints. One hop per line — `A -> B -> C` is not a chain.

### Suffixes

Read **only after the coordinates**, so parentheses or the word `inertia` inside a name are just
text.

| Suffix                          | Allowed on                                  | Meaning                                                    |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `(build)` `(buy)` `(outsource)` | component, pipeline child, `evolve`         | Sourcing method, shown under the label.                    |
| `(market)` `(ecosystem)`        | component, pipeline child                   | Market (three dots) / ecosystem (dotted ring) symbol.      |
| combined `(market, buy)`        | component, pipeline child                   | Comma-separated in one pair of parentheses.                |
| `inertia`                       | component, pipeline child                   | Resistance to change (bar right of the circle).            |
| `(color #rrggbb)`               | every element line                          | Colour; hex (3–8 digits) or a CSS colour name.             |
| `label [dx, dy]`                | anchor, component, pipeline child, `evolve` | Label offset in **pixels**, x first.                       |
| `url(<Def>)` / `url(https://…)` | component, submap                           | Link target; a named `url` line or a literal address.      |
| `(y <vis>)`                     | pipeline                                    | Pipeline height; needed when no component shares its name. |

Canonical component suffix order:
`(market, ecosystem, buy) inertia (color …) label [dx, dy] url(…)`.

### Comments

`// to end of line` and `/* block */` (may span lines). Both are stripped from the map and kept in
`rawPassthrough` — which means they move to the end of the file on save.

## Coordinates

- `[visibility, maturity]` — **visibility first.** This is `[y, x]`, the opposite of the usual
  `[x, y]`. Swapping them mirrors the map and produces no diagnostic.
- **Visibility** (y): `1` = top, visible to the user · `0` = bottom, invisible infrastructure.
- **Maturity** (x): `0` = genesis, left · `1` = commodity, right.
- Both `0…1`, dot decimals (`0.35`, `.35`; no `1e-3`, no `0,35`). Out-of-range values are clamped
  with a diagnostic. Written back rounded to 3 decimals, trailing zeros dropped (`0.80` → `0.8`).
- Different shapes: `pipeline [matStart, matEnd]` (both maturity), a block child `[mat]`, regions
  `[vis1, mat1, vis2, mat2]`, `evolve <Name> <mat>` (one maturity), and `label [dx, dy]` / `size`
  in **pixels**.

| Stage                | Maturity        |
| -------------------- | --------------- |
| Genesis              | `0` – `0.17`    |
| Custom-Built         | `0.17` – `0.40` |
| Product (+rental)    | `0.40` – `0.70` |
| Commodity (+utility) | `0.70` – `1`    |

A value on a boundary belongs to the stage on its right (`0.40` is Product). The boundaries are
fixed for text maps; `evolution` renames the four bands but never moves them.

## Laying out a generated map

At the default size, `0.1` maturity ≈ 108 px and `0.1` visibility ≈ 68 px. A component is a 30 px
circle with its label to the **right** (≈ 7 px per character).

```text
visibility 0.90–0.97   anchor(s) — the user
           0.70–0.88   what the user touches directly
           0.35–0.65   the supporting capabilities
           0.05–0.30   infrastructure, utilities
```

- A parent always sits **above** what it depends on — links read downwards.
- Neighbours on one row: `Δmaturity ≥ (7 × label characters + 40) / 1080`, about `0.1` for a
  10-character name. Neighbours in one column: `Δvisibility ≥ 0.06`. When a row is crowded, stagger
  heights instead of squeezing names.
- A note is centred on its coordinate. Put review notes **`0.06` above or below** the component they
  comment on, same maturity, and keep them under ~40 characters.
- Near the right edge (maturity > 0.85) use short names, or move the label left with
  `label [dx, dy]`, `dx ≈ −(7 × characters + 45)`.

`reference/layout.md` has the geometry, pipeline and region sizing, a full worked map and the note
colour table.

## Writing a map

1. **Write in canonical order** — the serializer's order, so a parse/serialize round-trip returns
   your file unchanged: `title`; then `style`, `size`, `evolution`, `y-axis`, `annotations` if
   needed; then `url` lines named `<Element> URL`, one per element and in element order, each
   referenced as `url(<Element> URL)`; then element lines (anchors, components, notes, …, in the
   order you like); then pipelines with their blocks; then `evolve` lines in the same order as
   their components; then all links.
2. **Anchor first:** one `anchor` per user, at the top.
3. **Components top-down**, each with a **unique** name, each below whatever needs it.
4. **Place maturity honestly** (the `wardley-mapping` skill decides where things belong); add
   `(build|buy|outsource)`, `(market)`, `(ecosystem)` and `inertia` after the coordinates.
5. **Declare every element before you link it** (the parser resolves links after the whole file,
   but declared-first text is canonical and easier to check).
6. **Add `evolve` lines** for expected movement, then **links last**, one block, top-down.
7. **Re-read the file as the parser would**: every link endpoint and every `evolve` name must
   match a declared name character for character.

A complete, canonical map:

```owm
title Coffee Subscription
anchor Coffee Drinker [0.95, 0.5]
component Monthly Box [0.84, 0.5]
component Roast Selection [0.68, 0.3] (build)
component Subscription Billing [0.6, 0.72] (buy)
component Roastery [0.45, 0.37] inertia
component Parcel Delivery [0.3, 0.82] (outsource)
note Our differentiator [0.74, 0.3] (color #0B7A55)
evolve Roastery 0.55 (outsource)
Coffee Drinker -> Monthly Box
Monthly Box -> Roast Selection
Monthly Box -> Subscription Billing
Monthly Box -> Parcel Delivery
Roast Selection -> Roastery
```

## Rules that bite

- **Names are exact references** — case-, space- and punctuation-sensitive. `user -> kettle` does
  not reach `User` / `Kettle`, and `A  B` (two spaces) is not `A B`. An unresolved link gives
  `Link: "…" not found`, is moved to the end of the file, and **does not exist on the map**. Linking
  to an undeclared or commented-out component is the most common defect in real-world maps.
- **A pipeline without a range makes the parser throw.** `pipeline X` with neither `[start, end]`
  nor block children is silently dropped — and if any link points at `X` (and no component is
  named `X`), parsing fails with `Edge dep_1: target "pipeline_x" references no element.` The
  Modeler then refuses the file. Commented-out coordinates (`pipeline X // [0.4, 0.7]`) and an empty
  block `{ }` do the same. A pipeline starting at maturity `≥ 1` throws too.
- **Nothing but `(color …)` may follow a note's or a pipeline's coordinates** (plus `(y …)` on a
  pipeline). Notes and pipelines have no label offset: `label [10, 10]` becomes note text or part
  of the pipeline name (which detaches the pipeline from its component), and once the file is
  saved the next parse reads that tuple as the coordinates. A note then jumps to the offset values
  (clamped, usually into a corner). A pipeline gets the offset as its range — `label [5, 5]` starts
  it at `1`, so the saved file **no longer opens** (parsing throws). The first open shows no
  diagnostic.
- **The first `(color …)` on a note, annotation or pipeline line wins**, wherever it stands. Never
  write `(color …)` inside their text (`note Legend: (color green) = good …`): the note takes that
  colour, the words vanish from the text, and with a second `(color …)` after the coordinates the
  two swap on every save.
- **`{` and `}` stand alone on their lines** (`{` may also end the pipeline line). Anything after a
  `{` that starts a line is deleted without a trace — `{ component Campfire [0.3] }` loses
  `Campfire` _and_ leaves the block open, which swallows every following line.
- **Typos and unknown words are silent.** A misspelled keyword is kept as an unknown line; an
  unknown decorator `(foo)` or stray words after a component's coordinates are dropped; an
  `evolution` line without exactly four labels and an `annotation` without coordinates are kept as
  unknown lines — all without a diagnostic. Check `rawPassthrough`, not just diagnostics (see
  `reference/api.md`).
- **Duplicate names collapse.** Links bind to the _first_ element with a name; on save the later
  ones become `Name 2`, `Name 3` — across anchors, components, pipeline children, accelerators and
  submaps (an anchor `Tea` and a component `Tea` give `Tea 2`). Give every element its own name.
- **A link's first word must not be a config keyword.** `Title Search -> X` silently **replaces the
  map title** and `Y-axis Tool -> X` the y-axis label — the link is gone; `Line Manager -> X`,
  `Style Guide -> X`, `Size Calc -> X` are unreadable lines. Avoid names whose first word is
  `title`, `style`, `size`, `evolution`, `evolve`, `annotation`, `annotations`, `line` or `y-axis` —
  or hyphenate (`Title-Search`). Names starting with `url` work, but a link from one must not carry
  a trailing `//` comment (`url` lines are never comment-stripped, so `URL Shortener -> X // why`
  looks for an element named `X // why`).
- **Keep these out of names:** `->` (write `→`; the serializer rewrites `->` to `→` anyway), `;`
  (starts a link annotation), `//` and `/*` (start a comment), `[n, n]` (read as coordinates),
  `+>` / `+<`, and `'` (switches off comment detection for the rest of the line). The serializer
  escapes none of these except `->`.
- **`evolve` strips parentheses and the word `inertia` from the name** — `evolve Tea (green) 0.8`
  looks for `Tea` and fails. Components you want to evolve need plain names. `evolve` works on
  components only (not anchors), and a second `evolve` for the same component replaces the first.
- **A `url(<Def>)` with no matching `url <Def> [address]` line is dropped** silently on save. An
  address containing `->`, `+>` or `+<` is misread as a link and lost — percent-encode the `>` /
  `<` (`%3E`, `%3C`).
- **Blank lines are dropped and comments move to the end of the file.** Do not rely on either for
  structure; use a `note` for anything that must stay next to a component.
- **Dependencies have no arrowhead.** Direction comes from the value chain: write `Parent -> Child`
  with the parent higher up.

## Editing an existing map

Change only what was asked and keep every other line byte-identical — unknown lines, comments,
colours, label offsets and coordinates the user set by hand all round-trip. Append new lines
instead of re-sorting existing ones; review notes go at the end of the element lines (or simply
at the end of the file).

Renaming a component means updating **every** reference: its link lines, its `evolve` line, and a
same-named `pipeline`. A missed reference does not fail loudly — the link just disappears.

When the user edits a map graphically, the Modeler rewrites the whole file: element lines grouped
by kind (team regions, pipelines, notes, components, anchors, annotations), then `evolve` lines and
links, comments at the end, legacy forms normalised. Expect that diff; do not fight it or restore
the old order by hand.

## Before handing a file back

- Every element line has its coordinates as `[visibility, maturity]`, both in `0…1`.
- Every name is unique, and every link endpoint and `evolve` name matches a declared name exactly.
- Every `pipeline` has `[start, end]` or block children; block children have one number.
- `{` and `}` each stand alone on their own line (`{` may end the pipeline line instead).
- Nothing follows a note's or pipeline's coordinates except `(color …)` / `(y …)`.
- No `(color …)` inside note, annotation or pipeline text.
- No name starts with a config keyword or contains `;`, `//`, `/*`, `[n, n]`, `+>` or `->`.
- Review notes use the palette hexes from `reference/layout.md`.
- If you can run Node: `parseDSLWithDiagnostics(text)` must not throw, `diagnostics` must be empty,
  `rawPassthrough` must hold nothing but comments, the map must have as many links as you wrote
  link lines, and a second `serializeDSL` pass must change nothing — the recipe is in
  `reference/api.md`. A difference between your text and its canonical form on a link, title or
  element line means content was lost, not reformatted.

## Opening the map

- **Miragon AI Design** and the **VS Code extension** read the file you wrote — nothing else to do.
  In VS Code (`miragon-gmbh.wardley-mapping-modeler`) `.wmap` / `.owm` open in the graphical editor;
  **View: Reopen Editor With… → Text Editor** shows the text, and edits in a split text view
  re-render live. A file that throws shows "Could not parse this Wardley map: …".
- **Web app** (https://wardley-maps.modeler.miragon.io): **Menu → Open…** or drag and drop the
  file. Or hand the user a share link — the map itself, deflate-raw compressed and base64url-encoded
  (no padding) behind `#mz=`:

  ```bash
  node -e "const fs=require('fs'),zlib=require('zlib');const text=fs.readFileSync(process.argv[1],'utf8');console.log('https://wardley-maps.modeler.miragon.io/#mz='+zlib.deflateRawSync(Buffer.from(text,'utf8')).toString('base64url'))" map.wmap
  ```

  That is exactly the web app's own encoding: links built this way decode byte-identically.
  Uncompressed `#m=<base64url>` links are still read. A share link carries the whole map — long
  maps make long URLs, and anyone with the link can read the map.

## Reference files (read on demand)

- `reference/grammar.md` — the exhaustive spec: every statement and suffix with its model element,
  line classification and precedence, comments, escaping, id allocation, serializer order and
  canonicalisation, when parsing throws, and the full diagnostics catalogue including the silent
  cases.
- `reference/layout.md` — canvas geometry in pixels and map units, spacing rules, label offsets,
  pipelines and team regions, review-note placement, the note colour table and a full worked map.
- `reference/api.md` — the programmatic API (`parseDSL`, `parseDSLWithDiagnostics`, `serializeDSL`,
  the JSON bridge), the `WardleyMap` model, a validation script for generated text and the
  share-link encoder/decoder.
