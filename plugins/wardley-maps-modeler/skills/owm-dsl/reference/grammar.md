# `.wmap` / `.owm` — exhaustive grammar

Reference for the parser in `@miragon/wardley-dsl` (`packages/dsl/src/{lexer,parser,serializer}.ts`
in the [wardley-maps-modeler](https://github.com/Miragon/wardley-maps-modeler) monorepo). Where this
file and the implementation disagree, the implementation wins — every behaviour below was verified
by running the parser (version 0.5.2).

## File model

A file is a sequence of lines, split on `\n` or `\r\n`. Leading and trailing whitespace on a line
is ignored, so indentation never matters. The **keyword** is the first word of the line
(`[A-Za-z][\w-]*`), matched case-insensitively — `Component` and `ANCHOR` work and are written back
in lowercase.

Each line is classified in this order:

1. **Block comment continuation** — while a `/*` is open, everything up to the next `*/` is
   comment. Text after `*/` on the closing line is parsed normally.
2. **Comment stripping** (skipped for `url` lines) — `/* … */` spans, then a trailing `// …`, are
   cut out and pushed to `rawPassthrough`.
3. **Blank** — an empty remainder is skipped and _not_ preserved.
4. **Inside an open pipeline block** — `}` closes it; `component <Name> [mat] …` becomes a child;
   every other line goes to `rawPassthrough` (silently).
5. **Block opening** — a line starting with `{` opens a block when the previous non-blank,
   non-comment line was a `pipeline`, and the rest of that line is **deleted** (not kept, no
   diagnostic); otherwise the whole line goes to `rawPassthrough` (silently).
6. **Link pre-detection** — see below.
7. **Keyword dispatch** — the statements in this file.
8. **Fallback** — try once more as a link; otherwise keep the line verbatim in `rawPassthrough`,
   **without a diagnostic**.

After the scan the parser resolves, in this order: pipelines (height, range, children), `evolve`
lines, legacy `build` / `buy` / `outsource <Name>` lines, `url(…)` references, links. Finally the
map is validated (`validateMap`: Zod schema plus cross-field invariants). Validation is the only
place parsing can throw — see "When parsing throws".

## Link pre-detection (the important precedence rule)

A line is taken as a **link** before keyword dispatch when all of these hold:

- its first word is **not** one of `title`, `style`, `size`, `evolution`, `y-axis`, `annotations`,
  `annotation`, `evolve`, `line` — those statements may contain `->` themselves;
- the line contains **no** `[number, number]` tuple anywhere (declarations always have one, links
  never do);
- the part before the first `;` splits into a non-empty left and right side at `->` or at a flow
  operator.

This exists because names may begin with a keyword: the default name `Component` produces
`Component -> Kettle`, and names like `Note Taking`, `Pipeline Monitor`, `Anchor Store` or
`URL Shortener` are common. Without the pre-check those links would be misread as broken
declarations.

Consequences:

- A name whose first word is one of the excluded keywords cannot start a link line.
  `Title Search -> X` becomes the map **title** `Search -> X`; `Y-axis Tool -> X` becomes the
  y-axis label `Tool` (a two-part `y-axis` drops its second part) — both without a diagnostic, and
  the link is gone. `Evolution Engine -> X` and `Annotation Service -> X` are kept as unknown lines
  without a diagnostic; `Line Manager -> X`, `Style Guide -> X`, `Size Calc -> X` and
  `Evolve Rate -> X` are diagnosed as uninterpretable. The same names on the _right_ of a link are
  fine.
- A link whose first word is `url` (`URL Shortener -> X`) works, but comment stripping is skipped
  for every line whose first word is `url`: `URL Shortener -> X // why` looks for an element named
  `X // why` and fails with `Link: "X // why" not found`. Put no trailing comment on such a link.
- A link whose annotation contains a tuple (`A -> B; at [0.5, 0.5]`) skips pre-detection. It still
  works through the fallback — unless its left name starts with a statement keyword:
  `Component X -> B; at [0.5, 0.5]` silently creates a phantom component named `X -> B; at`. Keep
  coordinates out of link annotations.

## Config statements

```text
title <free text>
style wardley|handwritten|colour|dark
size [width, height]
evolution <genesis>-><custom>-><product>-><commodity>
y-axis <label>
y-axis <label>-><bottom label>-><top label>
annotations [vis, mat]
```

A repeated config line overrides the earlier one; only the last survives the round-trip.

- **`title`** takes the rest of the line verbatim (after comment stripping — `://` survives,
  `// …` does not). Absent ⇒ `Untitled Map`. A bare `title` gives an empty title, written back as
  `title ` with a trailing space.
- **`style`** — matched case-insensitively and lowercased. An unknown value is a diagnostic and the
  line is kept in `rawPassthrough`. The Modeler currently renders `dark` differently; `wardley` is
  the default look; `handwritten` and `colour` are kept but look like `wardley`.
- **`size [width, height]`** — the plot area in pixels (`config.size`). The Modeler's default is
  `1080 × 680` and it never goes below `480 × 320`. Coordinates stay normalised, so a bigger size
  spreads the same map wider; label offsets and note sizes do not scale.
- **`evolution`** — split at `->`, each part trimmed; **exactly four** parts or the line is kept as
  an unknown line (no diagnostic) and the default labels stay. Empty parts are allowed
  (`Genesis->->Product->Commodity`). Written back without spaces around `->`. The labels only rename
  the four bands; the boundaries stay `0.17 / 0.40 / 0.70`. Useful presets (from Simon Wardley's
  landscape cheat sheet):

  | Mapping …  | Line                                                    |
  | ---------- | ------------------------------------------------------- |
  | activities | default — Genesis / Custom-Built / Product / Commodity  |
  | practices  | `evolution Novel->Emerging->Good->Best Practice`        |
  | data       | `evolution Unmodelled->Divergent->Convergent->Modelled` |
  | knowledge  | `evolution Concept->Hypothesis->Theory->Accepted`       |

- **`y-axis`** — split at `->`, empty parts removed. Part 1 is the axis label; parts 2 and 3 are the
  bottom and top end labels, used only when there are at least three parts. A two-part line loses
  its second part, a fourth part is dropped. Default: `Value Chain`, ends `invisible` / `visible`.
  An empty `y-axis` is a diagnostic.
- **`annotations [vis, mat]`** — position of the annotation legend (`annotationsBoxPosition`),
  clamped with a diagnostic. Without coordinates the line is kept as unknown, silently. The
  Modeler keeps the value but currently draws no legend box.

## Element statements

All positions are `[visibility, maturity]` in `0…1` unless stated otherwise. Values outside are
clamped, with the diagnostic `Coordinate N is outside [0,1] and was clamped` where noted.

The **name** of a declaration is everything between the keyword and the **first** `[n, n]` tuple,
trimmed; inner whitespace is kept (`A  B` is not `A B`). Because the first tuple wins, a typo in the
coordinates (`[0.55. 0.18]`) silently makes a later tuple — a label offset, say — the coordinates.

### `anchor`

```text
anchor <Name> [vis, mat] (color …) label [dx, dy]
```

The user or customer. → `AnchorElement`, id `anchor_<slug>`. Link endpoint. Position clamped with
a diagnostic. Decorators, `inertia` and `url(…)` are dropped silently. Missing coordinates or an
empty name: diagnostic, line kept.

### `component` (and legacy `market`, `ecosystem`)

```text
component <Name> [vis, mat] (market, ecosystem, build|buy|outsource) inertia (color …) label [dx, dy] url(<Def>)
market    <Name> [vis, mat] …          ≡ component <Name> [vis, mat] (market) …
ecosystem <Name> [vis, mat] …          ≡ component <Name> [vis, mat] (ecosystem) …
```

→ `ComponentElement`, id `cmp_<slug>`. Link endpoint. Position clamped with a diagnostic.

The suffix after the tuple is read in this order, each piece removed once found:

1. `(color <value>)` — see `(color …)` below.
2. `url(<Def>)` or `url(<scheme>://…)`.
3. `label [dx, dy]` — pixels, `label[12,-7]` without spaces works.
4. Every remaining `( … )` group, split at commas into tokens (case-insensitive): `market`,
   `ecosystem`, `inertia`, `build`, `buy`, `outsource`. Unknown tokens are dropped; with several
   methods the last wins.
5. The word `inertia`.

Anything else in the suffix is dropped silently. Text _before_ the tuple is always name, so
`component Tea (green) [0.6, 0.8]` is a component named `Tea (green)` with no decorator, and
`component X (buy) [0.5, 0.5]` is named `X (buy)`.

### Legacy `build`, `buy`, `outsource`

```text
buy <Name> [vis, mat] …     creates a component with method buy (same suffixes as component)
buy <Name>                  sets method buy on the existing component <Name>
```

The standalone form is resolved after the scan, against components only (pipeline children
included). An unknown name gives `buy: component "<Name>" not found` and keeps the line. A bare
`buy` is kept as unknown, silently. Both forms are written back as a `(buy)` decorator.

### `note`

```text
note <Text> [vis, mat] (color …)
```

→ `NoteElement`, id `note_<slug of text>`. Position clamped with a diagnostic.

- The **first** `(color …)` anywhere on the line is the colour; the text is everything else with
  the **first** tuple removed, trimmed. Text after the coordinates therefore becomes note text — and
  a second tuple in it becomes the coordinates on the next parse. A `(color …)` written inside the
  text colours the note and vanishes from the text; with a second `(color …)` after the
  coordinates, the two swap places on every save.
- A literal `\n` in the text is a line break; the serializer writes real line breaks back as `\n`.
  The Modeler shows note text as plain italic text (no Markdown), centred on the coordinate, one
  line per `\n`; a coloured note is drawn in that colour and slightly bolder.
- Empty text is allowed (`note [0.5, 0.5]`). No label offset, no decorators.
- Notes are not registered by name: never a link or `evolve` target.

### `annotation`

```text
annotation <n> [vis, mat] <text>
annotation <n> [[vis, mat], [vis, mat], …] (color …) <text>
```

→ `AnnotationElement`, id `anno_<n>` (`anno_1_2` on a repeat). Not a link endpoint.

- `<n>` is the leading integer. Without it the annotation gets the next value of a counter that
  only counts number-less annotations (1, 2, …) — mixing both styles produces duplicate numbers,
  which are allowed.
- The multi-position form needs **at least two** inner tuples. `[[0.38, 0.44]]` with one tuple is
  read as a single position and leaves `[ ]` in the text.
- `(color …)` may stand anywhere after the number; it is written back before the text.
- Positions are clamped with a diagnostic. Without coordinates the line is kept, silently.
- The Modeler draws a numbered marker at the **first** position with the text beside it; further
  positions are kept in the file.

### `pipeline`

```text
pipeline <Name> [matStart, matEnd] (color …) (y <vis>)

pipeline <Name> [matStart, matEnd]
{
  component <Child> [mat] (market, ecosystem, build|buy|outsource) inertia (color …) label [dx, dy]
}

pipeline <Name>
{
  component <Child> [mat]
}

pipeline <Name> [matStart, matEnd] {
  component <Child> [mat]
}
```

→ `PipelineElement`, id `pipeline_<slug>`, plus one `ComponentElement` per child (id `cmp_<slug>`,
`pipelineId` set).

- **The brackets are a maturity range**, not a position. Both values are clamped silently.
- **Height** (visibility): `(y <vis>)` when given; otherwise the visibility of the first anchor,
  component, accelerator or submap with the same name (declared before or after); otherwise `0.5`.
  Only a same-named **component** is the pipeline's _anchor component_: with just an anchor,
  accelerator or submap of that name, the first save adds `(y …)` and the Modeler draws the
  standalone square. Give a pipeline's name to a component only.
- **Range**: explicit, else from the children's smallest and largest maturity. With neither, the
  pipeline is not created and its line is kept in `rawPassthrough` **without a diagnostic** — and a
  link to its name then makes parsing throw. If `end ≤ start`, end becomes `min(1, start + 0.05)`;
  a start of `1` (after clamping) throws.
- **Name**: everything left after removing the first tuple, the first `(color …)` and `(y …)`. Any
  other text after the coordinates — `label [5, 5]`, `(buy)`, `inertia` — becomes part of the
  name (detaching the pipeline from its component at once), and a second tuple becomes the range on the next parse: values in `0…1` swap with the range
  on every save, others are clamped (`label [-40, 5]` stretches the pipeline to `[0, 1]`), and a
  first value `≥ 1` (`label [5, 5]`) makes that next parse **throw**. A `(color …)` inside the
  name behaves as on a note: the first one wins, and two swap on every save.
- **Block**: `{` as the **last** character of the pipeline line, or alone on the next non-blank,
  non-comment line. Anything after a line-opening `{` is deleted — not kept, no diagnostic —
  so `{ component Campfire [0.3]` loses `Campfire`, and the one-line `{ component Campfire [0.3] }`
  loses it _and_ leaves the block open. Text after a `{` on the pipeline line means the line no
  longer ends with `{`: no block opens and the text becomes part of the pipeline name. Children
  are `component <Name> [mat]` with **one** number (clamped silently); they take the pipeline's
  height and accept decorators, `inertia`, `(color …)` and `label [dx, dy]`, but no `url(…)`. A
  child with two numbers, or any other line inside the block, goes to `rawPassthrough` silently
  and moves out of the block on save. An unclosed `{` swallows every following line the same way.
  `}` must stand on its own line.
- **Name resolution**: children are registered after the scan, so a top-level component with the
  same name wins every link. A link to the pipeline's name binds to the first anchor, component,
  accelerator or submap of that name when one exists, otherwise to the pipeline itself (the Modeler draws a small square on its top edge).
- The anchor component's own maturity is independent of the range; the Modeler draws it on the
  box's top edge.

### `evolve`

```text
evolve <Name> <targetMat>
evolve <Name> <targetMat> (build|buy|outsource) label [dx, dy]
evolve <Name>-><New Name> <targetMat>
evolve <Name> -> <New Name> <targetMat> (buy)
```

Sets `movement` on the component `<Name>`: `targetEvolution`, optional `newLabel`, `method`,
`labelOffset`. Not an element of its own.

- Parsing: remove `label [dx, dy]`; remove **every** `( … )` group (reading a method token from it)
  and the word `inertia`; the last remaining word is the target, the rest is the name; the name is
  split at the first `->` into old and new name.
- The target must be a plain number (`0.62`, not `0,62`), else diagnostic. Clamped with a
  diagnostic.
- Resolved after the scan against **components** (pipeline children included). Anchors, unknown
  names, names containing parentheses or the word `inertia` give
  `evolve: component "<Name>" not found`, and the line is kept.
- A second `evolve` for the same component replaces the first. No check that the target lies to
  the right of the current maturity.
- `(color …)` on an `evolve` line is swallowed silently.
- The Modeler draws a red dashed arrow at the component's height to a target circle labelled with
  the new name (or the old one) and the method. `label [dx, dy]` is stored and written back but not
  yet used for drawing.

### `pioneers`, `settlers`, `townplanners`

```text
pioneers     [vis1, mat1, vis2, mat2] (color …)
settlers     [vis1, mat1, vis2, mat2] (color …)
townplanners [vis1, mat1, vis2, mat2] (color …)
```

→ `AttitudeElement` (`kind`), id `attitude_<kind>`. Two opposite corners in any order; normalised to
top-left (`position`: higher visibility, lower maturity) and bottom-right (`corner2`). Values
clamped silently. Words between keyword and tuple are dropped. The legacy corner-plus-size form
`pioneers [vis, mat] width height` is a diagnostic. Drawn as a translucent rectangle behind
everything, labelled with the kind in its top-left corner; `(color …)` overrides the default
stroke.

### `accelerator`, `deaccelerator`

```text
accelerator   <Name> [vis, mat] (color …)
deaccelerator <Name> [vis, mat] (color …)
```

→ `AcceleratorElement` (`direction: 'accelerate' | 'deaccelerate'`), id `accel_<slug>`. Link
endpoint. Position clamped with a diagnostic. Decorators and `label [dx, dy]` are dropped silently.

### `submap`

```text
submap <Name> [vis, mat] (color …) url(<Def>)
```

→ `SubmapElement`, id `submap_<slug>`, `urlRef` = the resolved address. Link endpoint. Decorators
and `label [dx, dy]` are dropped silently.

### `url`

```text
url <Def> [<address>]
```

A named address. **Exempt from comment stripping**, so `https://…` and even `//` inside the address
survive. The name is the text before the first `[`, the address runs from there to the **last**
`]` (so `]` inside the address is fine); nothing may follow the closing `]`. Malformed lines are a
diagnostic.

- Referenced by `url(<Def>)` on a `component` or `submap`, declared before or after it.
  `url(<scheme>://…)` with a literal address works too (`mailto:` does not — it has no `//`).
- A `url(<Def>)` with no matching definition is **dropped silently** — the address is lost.
- An address containing `->` or a flow operator (`+>`, `+<`) makes link pre-detection take the
  definition for a link (`Link: "url Docs [https://example.com/a" not found`): the definition is
  lost and the element keeps no address. A literal `url(https://…->…)` survives the first parse,
  but its saved definition breaks on the next. Percent-encode `>` / `<` as `%3E` / `%3C`.
- An unreferenced definition is kept in `rawPassthrough` (moved to the end on save).
- On save, every element address becomes its own definition `url <Element Name> URL [address]`
  directly after the config lines, referenced as `url(<Element Name> URL)` at the end of the
  element line. A definition shared by two elements is split into two.

### `line`

```text
line [[vis, mat], [vis, mat], …] (closed) (dashed|dotted) (color …)
```

A freeform polyline (Modeler extension) → `DrawingElement`, id `draw_line`, `draw_line_2`, … At
least two points (otherwise a diagnostic); points clamped with a diagnostic. `(closed)` makes a
polygon; `(dashed)` beats `(dotted)`; `(solid)` is the default and never written.

### `(color …)`

`(color #rgb)` … `(color #rrggbbaa)` (3–8 hex digits) or a CSS colour name (`(color teal)`).
Keyword case-insensitive, value kept as written. Allowed on every element line and on pipeline
children. An invalid value (`#12`, `rgb(…)`) is not a colour: on a component it is dropped as an
unknown decorator, on a note it becomes note text. Use the palette hexes from `layout.md` for
review notes.

On `note`, `annotation` and `pipeline` lines the **first** `(color …)` anywhere on the line is
taken, even inside the text. Never write `(color …)` into note, annotation or pipeline text — a
legend note like `Legend: (color green) = good` turns green and loses those words.

## Links

```text
<From> -> <To>
<From> -> <To>; <annotation>
<From> +> <To>
<From> +<> <To>
<From> +< <To>
<From> +'<value>'> <To>
<From> +'<value>'<> <To>
<From> +'<value>'< <To>
```

- The annotation is everything after the **first** `;`, trimmed; empty is dropped. It may contain
  `->`, `+>` or anything else.
- **`->` wins**: if the part before `;` contains `->` anywhere, the line is a dependency split at
  the first `->` (`A +> B -> C` is a dependency from `A +> B`). Otherwise the first valid flow
  operator splits it: a `+` that is not the first character, optionally followed by `'value'`, then
  `<>`, `>` or `<`. Spaces around operators are optional (`A->B`, `A+>B`).
- The flow value sits between single quotes and cannot contain `'`. `A +'x' B` (no operator) is
  kept as an unknown line, silently.
- `+<` reverses the direction: `A +< B` is stored as a flow from `B` to `A` and written back as
  `B +> A`. `+<>` sets `bidirectional`.
- **Resolution** happens after the whole file is read, through one name table where the **first
  registration wins**: anchors, components (all forms), accelerators and submaps in line order;
  then pipeline names (only if unused); then pipeline children (only if unused). Notes,
  annotations, regions and drawings are never registered.
- An unresolved endpoint gives `Link: "<name>" not found` — naming the left side when it is
  unresolved, else the right — and the whole line goes to `rawPassthrough`. The link does not
  exist on the map.
- Self-links and duplicate links are allowed. There are no chains: `A -> B -> C` looks for an
  element named `B -> C`.
- → `DependencyLink` (`dep_N`) or `FlowLink` (`flow_N`, `flowValue`, `bidirectional`), `label` = the
  annotation. The Modeler draws dependencies as grey lines **without** arrowheads, flows as blue
  lines with arrowheads, the flow value above the midpoint and the annotation in italics at it.

## Comments

- `// …` to the end of the line. The scanner is **URL-aware** (`//` right after `:` is a scheme
  separator, so `https://…` survives) and **quote-aware** (`'` toggles "inside quotes"; `//` inside
  quotes is not a comment — that keeps `+'http://x'>` intact, but a lone apostrophe in a name
  switches comment detection off for the rest of the line).
- `/* … */`, possibly spanning lines; the opening `/*` is found quote-aware.
- `url` lines are never comment-stripped.
- Comments never produce diagnostics. They go to `rawPassthrough` — a trailing comment is split
  off its statement — and are written back at the **end of the file**, in source order. Lines inside
  a multi-line block comment keep their indentation.

## Escaping on serialize

The serializer changes only this:

| Input                                                           | Written as                                            |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `->` in an anchor, component, child, accelerator or submap name | `→` (U+2192) — permanent                              |
| empty name of those kinds                                       | `User` (anchor), `Component`, `Accelerator`, `Submap` |
| a name already used by an earlier element of those kinds        | `Name 2`, `Name 3`, … (`Name 2 2` if taken)           |
| leading / trailing spaces in a name                             | trimmed                                               |
| a line break in note text                                       | `\n`                                                  |

Nothing else is escaped. `//`, `/*`, `;`, a `[n, n]` tuple, a line break in a component name, a
leading config keyword or an odd `'` are written verbatim and break the next parse. Since you write
the file yourself, keep them out of names.

Numbers are rounded to 3 decimals and printed without trailing zeros (`0.80` → `0.8`, `1.0` →
`1`, `0.0004` → `0`); label offsets the same way.

## Serializer output order

```text
title
style                        when set
size                         when set
evolution                    when set
y-axis                       when set
annotations                  when set
url <Element> URL [address]  one per element with an address, in element order
<element lines>              in model order, pipelines (each followed by its { } block) last
evolve lines                 in element order
links                        in source order, dependencies and flows interleaved
rawPassthrough               verbatim
```

The file ends with a newline. Element lines keep source order, except that pipelines — resolved
after the scan — come after every other element. Pipeline children are emitted only inside their
block, indented by two spaces.

When the Modeler saves after a graphical edit it uses the same serializer, but hands it the
elements in canvas order, so the element lines come out **grouped by kind**: team regions,
pipelines (with their blocks), notes, components / accelerators / submaps (in source order),
anchors, annotations, drawings. Config, `url`, `evolve`, link and `rawPassthrough` lines keep the
order above.

`rawPassthrough` order: everything collected during the scan in source order (comments, unreadable
and unknown lines, stray block lines), then pipelines without a range, unresolved `evolve` lines,
unresolved legacy method lines, unreferenced `url` definitions, unresolved links. A raw line whose
first word is `evolution` or `y-axis` is dropped when the config already has that setting, so an
invalid duplicate cannot contradict it.

## Round-trip guarantee

`serializeDSL(parseDSL(text))` is canonical text. What the first pass changes:

- blank lines and indentation are removed; keywords are lowercased;
- comments, unknown lines and unresolved links move to the end of the file;
- config lines move to the top in the order above; a repeated config line collapses to the last;
- `market X …`, `ecosystem X …` and `buy X [..]` become `component X … (market|ecosystem|buy)`; a
  standalone `buy X` is folded into `X`'s decorator;
- decorators are normalised to one group in the order `market, ecosystem, method`, `(inertia)`
  becomes a trailing `inertia`, unknown tokens and stray words are dropped;
- component suffixes are reordered to `(…) inertia (color …) label [dx, dy] url(…)`;
- `url` definitions are renamed `<Element> URL` and moved to the top; literal `url(scheme://…)`
  becomes a definition;
- pipelines move behind the other elements, a missing range is filled in from the children, `{`
  goes on its own line, `(y …)` is added or dropped as needed;
- region corners are normalised (top-left first) and region labels dropped;
- `evolve` lines move behind the elements, a rename is written without spaces (`A->B`), a repeated
  `evolve` collapses to the last;
- `+<` becomes the reversed `+>`, link spacing is normalised (`A -> B`, `A +'v'> B`), an empty
  `;` annotation is dropped;
- annotations get their number written out, their colour moved before the text;
- numbers are rounded to 3 decimals, clamped values are written clamped;
- duplicate names get a ` 2` suffix, `->` in names becomes `→`.

Labels, note text, colours, label offsets, unknown lines and comment text survive unchanged.

**Fixed point:** canonical text parses back to the same map, and a second `serializeDSL` pass is
byte-identical — for every file that parses with zero diagnostics, has no unknown lines in
`rawPassthrough` other than comments, no extra text after a note's or pipeline's coordinates and
no `(color …)` inside note or pipeline text. The known exceptions:

- a stray line inside a `{ }` block — moved out on the first pass, re-parsed as a real element on
  the second;
- a second `[n, n]` tuple on a `note` or `pipeline` line — the second pass reads it as the
  coordinates or range: values in `0…1` swap on every pass, others are clamped (a note jumps to a
  corner, a pipeline may stretch to `[0, 1]`), and a pipeline whose new start is `≥ 1` throws;
- two `(color …)` groups on a `note` or `pipeline` line — the first wins, so they swap on every
  pass.

## When parsing throws

`parseDSL` and `parseDSLWithDiagnostics` throw only when the finished map fails validation:

| Cause                                                                               | Error                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| a link to or from a pipeline without a range (below)                                | `Edge dep_1: target "pipeline_x" references no element.`     |
| a pipeline whose start is `≥ 1` (`[1, 1]`, `[1.3, 0.5]`)                            | Zod issue `evolutionEnd must be greater than evolutionStart` |
| a tuple after a pipeline's range (`label [5, 5]`): once saved, it becomes the range | the same Zod issue, on the **next** open                     |
| a non-number in `(y …)` (`(y 0.4.1)`)                                               | Zod issue: expected number, received NaN                     |
| a number of 309+ digits in `label [..]` or `size [..]`                              | Zod issue: expected number, received Infinity                |
| an annotation number beyond `2^53`                                                  | Zod issue: integer outside the safe range                    |

The first case is the one that happens in practice. A pipeline has no range when its line has no
`[start, end]` tuple — missing, commented out (`pipeline X // [0.4, 0.7]`) or unreadable — and it
has no block children (no block, or an empty `{ }`). Such a pipeline is not created, but its name
was already registered, so a link to it (or from it — then the message says `source`, and flows say
`flow_N`) points at nothing — unless a component, anchor, accelerator or submap of the same name
exists, which then takes the link.

Everything else degrades into diagnostics, `rawPassthrough` or one of the silent cases below. The
Modeler cannot open a file that throws: VS Code shows "Could not parse this Wardley map: <error>" and keeps the last good map.

## Diagnostics catalogue

`parseDSLWithDiagnostics(text)` returns `{ map, diagnostics }`; each diagnostic is
`{ line, message, text }` with a 1-based line number and the trimmed source line. Order: scan-time
diagnostics in line order (a line can have several, e.g. two clamped values), then `evolve`, then
legacy method, then link diagnostics.

The parser emits exactly five messages.

**`Line could not be interpreted (kept losslessly in rawPassthrough)`** — the line looks like a
known statement but cannot be read. The line is kept and written back unchanged. Causes:

- `anchor`, `component`, `market`, `ecosystem`, `note`, `accelerator`, `deaccelerator` or `submap`
  without a readable `[vis, mat]` (missing, `1e-3`, `0,5`) or with an empty name;
- `pipeline` without a name; `evolve` without a name or a numeric target;
- `style` with an unknown value, `size` without `[w, h]`, an empty `y-axis`;
- `line` with fewer than two points; a region without four numbers (including the legacy
  `[vis, mat] width height` form); a malformed `url` line;
- a link whose first word is `Line`, `Style`, `Size` or `Evolve` (`Line Manager -> X`).

Fix the syntax; rename elements whose first word is a config keyword.

**`Coordinate N is outside [0,1] and was clamped`** — a position of an anchor, component, note,
accelerator, submap or annotation, the `annotations` box, a `line` point or an `evolve` target lies
outside `0…1`. The value is clamped and written back clamped. Use `0…1` — and check for a typo in
the coordinates that made a later tuple, such as a label offset, the coordinates.

**`evolve: component "<Name>" not found`** — no component has exactly that name: a typo, a case
difference, an anchor, or parentheses / the word `inertia` in the name (both are stripped from an
`evolve` line). The line is kept; no movement is drawn. Match the component name; give evolving
components plain names.

**`build: component "<Name>" not found`** (also `buy:` and `outsource:`) — a legacy standalone
method line names an unknown component. Prefer the `(build)` suffix on the component line.

**`Link: "<Name>" not found`** — a link endpoint is undeclared, misspelled, differs in case or
spacing, is commented out, is a note / annotation / region, contains `;`, is a chain
(`A -> B -> C`), or a trailing comment became part of the name — after a lone `'`, or on a link
whose first word is `url` (never comment-stripped). The message names the
left side when it is unresolved, otherwise the right. The whole line is kept and moved to the end;
the link does not exist. Declare the element and copy its name exactly.

### Silent cases (no diagnostic)

An empty `diagnostics` array is necessary but **not sufficient**. These produce no diagnostic:

| Input                                                                                    | What happens                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| unknown or misspelled keyword (`compnent X [0.5, 0.5]`)                                  | kept as an unknown line, nothing drawn                             |
| `evolution` with other than four parts                                                   | kept as an unknown line; default labels                            |
| `annotation` / `annotations` without coordinates                                         | kept as an unknown line                                            |
| `Title Search -> X`, `Y-axis Tool -> X`                                                  | **replaces the map title / y-axis label**; no link                 |
| `Evolution Engine -> X`, `Annotation Service -> X`                                       | kept as unknown lines; no link                                     |
| `pipeline X` with neither range nor children                                             | pipeline not created; a link to `X` throws                         |
| `{` / `}` without a pipeline; a non-child line or a two-number child inside a block      | kept as unknown lines, moved out of the block                      |
| an unclosed `{`                                                                          | every following line is swallowed as above                         |
| text after a `{` that opens a block (`{ component A [0.3]`)                              | **deleted** — not even kept in `rawPassthrough`                    |
| bare `build` / `buy` / `outsource`; a flow with a value but no operator                  | kept as unknown lines                                              |
| unknown decorator tokens, stray words after a component's coordinates                    | dropped                                                            |
| decorators, `inertia`, `label [..]` or `url(…)` where not supported (see each statement) | dropped                                                            |
| `url(<Def>)` without a definition, `url(mailto:…)`                                       | dropped — the address is lost                                      |
| text after a note's or pipeline's coordinates                                            | becomes part of the note text / pipeline name                      |
| `(color …)` inside note, annotation or pipeline text                                     | the first one on the line is the colour; it vanishes from the text |
| `y-axis` with two parts, or more than three                                              | extra parts dropped                                                |
| a repeated config line or `evolve` for the same component                                | the later one wins                                                 |
| pipeline range, `(y …)`, child maturity or region corners outside `0…1`                  | clamped                                                            |
| duplicate names                                                                          | links bind to the first; later ones renamed `Name 2` on save       |

The validation recipe in `api.md` therefore also lists every non-comment `rawPassthrough` entry,
counts `title` lines and links, and compares the file with its canonical text — the only place
deleted or absorbed text shows up.

## Id allocation

Ids exist for every element and edge but never appear in the text — they matter only for the JSON
form and the API.

- Elements: `<prefix>_<slug>`, with `_2`, `_3`, … on collision. `slug` lowercases and turns every
  run of characters outside `a-z0-9` into `_`, trimming one leading and one trailing `_`; an empty
  result becomes `x` (so `数据` → `cmp_x`).
- Prefixes: `anchor` · `cmp` (components in every form, pipeline children) · `note` (slug of the
  text) · `anno_<number>` · `pipeline` · `attitude_<kind>` · `accel` (both directions) · `submap` ·
  `draw_line`.
- Allocation follows scan order, then pipelines and their children, so ids depend on line order —
  do not rely on them across edits.
- Edges: `dep_1`, `dep_2`, … and `flow_1`, `flow_2`, … in link order. Elements and edges share one
  namespace in the Modeler; the prefixes keep them apart.

## Forms from other OWM documentation

Other OWM tools and guides use a few forms this parser reads differently:

| Written elsewhere                                | What happens here                              | Write instead                               |
| ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------- |
| `pioneers [0.6, 0.05] 0.35 0.35` (corner + size) | diagnostic, no region                          | `pioneers [0.6, 0.05, 0.25, 0.4]` (corners) |
| `annotation 1 [[0.38, 0.44]] Text` (one tuple)   | single position, `[ ]` left in the text        | `annotation 1 [0.38, 0.44] Text`            |
| `y-axis Value Chain -> Invisible` (two parts)    | `Invisible` dropped                            | `y-axis Value Chain->Invisible->Visible`    |
| `url Name [address]` without `url(Name)`         | not attached to anything                       | add `url(Name)` to the element line         |
| `Business->Cup of Tea` (no spaces)               | fine, written back as `Business -> Cup of Tea` | —                                           |
| `build Cup of Tea` (standalone)                  | fine, folded into `(build)`                    | `component Cup of Tea [..] (build)`         |
| `pipeline X {` with children and no range        | fine, range taken from the children            | —                                           |
