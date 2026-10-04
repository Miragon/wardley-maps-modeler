# `.wmap` / `.owm` — exhaustive grammar

Reference for the parser in `@miragon/wardley-dsl`
(`packages/dsl/src/{lexer,parser,serializer,names}.ts` in the
[wardley-maps-modeler](https://github.com/Miragon/wardley-maps-modeler) monorepo). Where this file
and the implementation disagree, the implementation wins. Every behaviour below was checked by
running the current `@miragon/wardley-dsl` parser, the version going into the next release. Older
releases throw, or drop text silently, in several cases that this file describes as diagnosed.

## File model

A file is a sequence of lines, split on `\n` or `\r\n`. Stray trailing `\r` are removed, and the
newline that ends the last line does not start another one. Leading and trailing whitespace on a
line is ignored, so indentation never matters. The **keyword** is the first word of the line
(`[A-Za-z][\w-]*`), matched case-insensitively: `Component` and `ANCHOR` work and are written back
in lowercase. A keyword directly followed by a non-ASCII letter is no keyword: `componentä X …` is
an unknown statement.

Each line is processed in this order:

1. **Block comment continuation.** While a `/*` is open, everything up to the next `*/` is comment.
   Text after `*/` on the closing line is parsed normally.
2. **Comment stripping**, left to right. `/* … */` spans and a trailing `// …` are cut out and
   pushed to `rawPassthrough`. A complete url definition (`url <Name> [address]`) is not stripped,
   so `//` survives in its address.
3. **Braces.**
   - A leading `{` opens a block when the previous statement was a `pipeline` line. Otherwise it
     is ignored with a diagnostic.
   - A leading `}` closes the open block. A `}` that stands alone with no block open is ignored
     with a diagnostic.
   - The rest of the line is read normally.
   - Inside a block, a `}` at the end of a line closes the block after that line is read.
4. **Blank lines** are skipped and _not_ preserved.
5. **Inside an open pipeline block**, `component <Name> [mat] …` becomes a child. Every other line
   goes on to steps 6–8 like any top-level line.
6. **Link pre-detection**, see below.
7. **Keyword dispatch**, the statements in this file.
8. **Fallback.** The line is tried once more as a link. Otherwise it is kept verbatim in
   `rawPassthrough` with `Unknown statement "<first word>"`, or with a link or flow message when it
   looks like a broken link.

After the scan the parser resolves, in this order:

1. unusable `evolution` / `y-axis` lines;
2. pipelines (height, range, children and their names);
3. `evolve` lines;
4. legacy `build` / `buy` / `outsource <Name>` lines;
5. `url(…)` references;
6. links.

Parsing **never throws**. Every string yields a valid map, and whatever the map schema would reject
is normalised with a diagnostic.

## Link pre-detection (the important precedence rule)

A line is taken as a **link** before keyword dispatch when the part before its first `;`:

- contains no `[number, number]` tuple (a link annotation after the `;` may hold one), and
- splits into a non-empty left and right side at `->` or at a flow operator.

This exists because names may begin with a keyword: the default name `Component` produces
`Component -> Kettle`, and names like `Note Taking`, `Pipeline Monitor`, `Anchor Store` or
`URL Shortener` are common.

Some link-shaped lines could also be their keyword's statement. Such a line is a link only when
**both** names are declared somewhere in the file, even further down. A name counts as declared in
the form written, and in the form the serializer writes the keyword line (lowercase keyword, single
spaces). Otherwise the line is read as that statement. The ambiguous lines are:

- lines whose first word is `title`, `style`, `size`, `evolution`, `y-axis`, `annotations`,
  `annotation`, `evolve` or `line`;
- declaration lines whose tuple stands after the `;`: `anchor`, `component`, `market`, `ecosystem`,
  `note`, `pioneers`, `settlers`, `townplanners`, `build`, `buy`, `outsource`, `accelerator`,
  `deaccelerator` and `submap`;
- a complete url definition, whose address may hold `->` or `+>`.

`pipeline` is never ambiguous, so `Pipeline Monitor -> X` is always a link.

Consequences:

- `Title Search -> Index` is a link when `Title Search` and `Index` are both declared.
- With undeclared names, the same line is the statement:
  - `Title Search -> Index` sets the map **title** `Search -> Index`, silently;
  - `Y-axis A -> B -> C` sets a three-part y-axis, silently.

  Every other keyword gets a diagnostic from its statement:
  - `Y-axis Tool -> X`: the y-axis message;
  - `Evolution Engine -> X`: the evolution message;
  - `Annotation Service -> X`: no position;
  - `Line Manager -> X`, `Style Guide -> X`, `Size Calc -> X`, `Evolve Rate -> X`: could not be
    interpreted.

  When the left name is declared and the right one is not, the parser adds
  `Link: "X" not found — read as a "title" statement`.

- Names that start with `url` work as link endpoints, trailing `// comment` included.
- `A -> B; at [0.5, 0.5]` is a link with the annotation `at [0.5, 0.5]`.
- `note Risk -> high; see [0.5, 0.5]` is a note, unless both link names are declared.

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

A repeated config line replaces the earlier one, with
`Repeated "<keyword>" — replaces the one on line N`. Only the last survives the round-trip.

- **`title`** takes the rest of the line verbatim, after comment stripping: `://` survives,
  `// …` does not. Absent ⇒ `Untitled Map`. A bare `title` gives an empty title, written back as
  `title ` with a trailing space.
- **`style`** is matched case-insensitively and lowercased. An unknown value cannot be interpreted;
  the line is kept. The Modeler currently renders `dark` differently. `wardley` is the default
  look. `handwritten` and `colour` are kept but look like `wardley`.
- **`size [width, height]`** is the plot area in pixels (`config.size`). The Modeler's default is
  `1080 × 680`, and it never goes below `480 × 320`. Coordinates stay normalised, so a bigger size
  spreads the same map wider; label offsets and note sizes do not scale. A value beyond `10^12`
  cannot be interpreted.
- **`evolution`** is split at `->`, each part trimmed. It needs **exactly four** parts, otherwise
  you get `Evolution needs exactly four stages, found N` and the default labels stay:
  - `— not used`: the line is kept;
  - `— removed; another "evolution" line sets it`: the line is dropped.

  Empty parts are allowed (`Genesis->->Product->Commodity`). The line is written back without spaces
  around `->`. The labels only rename the four bands; the boundaries stay `0.17 / 0.40 / 0.70`.
  Useful presets (from Simon Wardley's landscape cheat sheet):

  | Mapping …  | Line                                                    |
  | ---------- | ------------------------------------------------------- |
  | activities | default — Genesis / Custom-Built / Product / Commodity  |
  | practices  | `evolution Novel->Emerging->Good->Best Practice`        |
  | data       | `evolution Unmodelled->Divergent->Convergent->Modelled` |
  | knowledge  | `evolution Concept->Hypothesis->Theory->Accepted`       |

- **`y-axis`** is split at `->`. One part is the axis label. Three non-empty parts are the label and
  the bottom and top end labels.
  - Any other shape is read as far as it goes, with
    `y-axis takes "Label" or "Label->Bottom->Top" — read as "…"`: two parts keep only the label,
    four or more keep the first three.
  - A later `y-axis` line also replaces the end labels.
  - An empty `y-axis` gives `y-axis has no label`, with `— not used` or `— removed; …` as for
    `evolution`.
  - Default: `Value Chain`, ends `invisible` / `visible`.
- **`annotations [vis, mat]`** is the position of the annotation legend (`annotationsBoxPosition`),
  clamped with a diagnostic. Without coordinates: `Annotations box has no position — not used`, and
  the line is kept. The Modeler keeps the value but currently draws no legend box.

## Element statements

All positions are `[visibility, maturity]` in `0…1` unless stated otherwise. Values outside are
clamped, with the diagnostic `Coordinate N is outside [0,1] and was clamped`.

The **name** of a declaration is everything between the keyword and the **first** `[n, n]` tuple,
trimmed. Inner whitespace is kept: `A  B` is not `A B`. Because the first tuple wins, a typo in the
coordinates (`[0.55. 0.18]`) silently makes a later tuple, such as a label offset, the coordinates.

The parser stores each name the way the serializer will write it, with a diagnostic for every
change:

- `->` becomes `→`;
- a `+` before `>`, `<` or `'` becomes `＋`;
- a leading `{` becomes `｛`;
- a name already taken becomes `Name 2`, `Name 3`.

The **suffix** after the tuple is split into tokens, in any order: `(color …)`, `(y …)`,
`label [dx, dy]`, `url(…)`, other `( … )` groups and words. Each statement keeps the tokens it
supports, listed below. Of a single-valued suffix (colour, label offset, url, method, height,
stroke) the first one wins. Everything else is dropped, with one diagnostic per line:
`Ignored text after the coordinates: "(foo) shiny", "glossy"`.

### `anchor`

```text
anchor <Name> [vis, mat] (color …) label [dx, dy]
```

The user or customer. → `AnchorElement`, id `anchor_<slug>`. Link endpoint. Position clamped with
a diagnostic. Decorators, `inertia` and `url(…)` are ignored with a diagnostic. Missing coordinates
or an empty name: the line cannot be interpreted and is kept.

### `component` (and legacy `market`, `ecosystem`)

```text
component <Name> [vis, mat] (market, ecosystem, build|buy|outsource) inertia (color …) label [dx, dy] url(<Def>)
market    <Name> [vis, mat] …          ≡ component <Name> [vis, mat] (market) …
ecosystem <Name> [vis, mat] …          ≡ component <Name> [vis, mat] (ecosystem) …
```

→ `ComponentElement`, id `cmp_<slug>`. Link endpoint. Position clamped with a diagnostic.

Suffixes, in any order:

- `( … )` groups, split at commas into the tokens `market`, `ecosystem`, `inertia`, `build`, `buy`
  and `outsource` (case-insensitive). The first method wins.
- the word `inertia`;
- `(color <value>)`;
- `label [dx, dy]`, in pixels (`label[12,-7]` without spaces works);
- `url(<Def>)` or `url(<scheme>://…)`.

Unknown tokens and stray words are ignored with a diagnostic. Text _before_ the tuple is always name,
so `component Tea (green) [0.6, 0.8]` is a component named `Tea (green)` with no decorator, and
`component X (buy) [0.5, 0.5]` is named `X (buy)`.

### Legacy `build`, `buy`, `outsource`

```text
buy <Name> [vis, mat] …     creates a component with method buy (same suffixes as component)
buy <Name>                  sets method buy on the existing component <Name>
```

- The keyword is the first method, so `build A [..] (buy)` reports `(buy)` as ignored.
- The standalone form is resolved after the scan, against components only (pipeline children
  included). The diagnostics:
  - an unknown name: `buy: component "<Name>" not found`, and the line is kept;
  - a component that already has another method:
    `buy: "<Name>" already has the method "build" — replaced`;
  - a bare `buy`: `buy: needs a component name — not used`.
- Both forms are written back as a `(buy)` decorator.

### `note`

```text
note <Text> [vis, mat] (color …)
```

→ `NoteElement`, id `note_<slug of text>`. Position clamped with a diagnostic.

- The text is everything before the first tuple, trimmed. After the tuple only `(color …)` counts;
  any other text there, including a `label [dx, dy]` or a second tuple, is ignored with a
  diagnostic.
- `(color …)` inside the text is plain text. A `(color …)` group at the very end of the text, just
  before the coordinates, stays text but gives a hint:
  `"(color …)" before the coordinates is read as part of the text — write it after them`.
- A literal `\n` in the text is a line break; the serializer writes real line breaks back as `\n`.
- The Modeler shows note text as plain italic text (no Markdown), centred on the coordinate, one
  line per `\n`. A coloured note is drawn in that colour and slightly bolder.
- Empty text is allowed (`note [0.5, 0.5]`). Notes have no label offset and no decorators.
- Notes are not registered by name: never a link or `evolve` target.

### `annotation`

```text
annotation <n> [vis, mat] (color …) <text>
annotation <n> [[vis, mat], [vis, mat], …] (color …) <text>
```

→ `AnnotationElement`, id `anno_<n>` (`anno_1_2` on a repeat). Not a link endpoint.

- `<n>` is the leading integer. Without it the annotation gets the next value of a counter that
  only counts number-less annotations (1, 2, …). Mixing both styles produces duplicate numbers,
  which are allowed. A number beyond `2^53` cannot be interpreted.
- The position is the first single tuple or tuple list on the line, whichever comes first. A list
  with one entry (`[[0.38, 0.44]]`) is a single position. An unreadable entry in a list is dropped
  with `Unreadable number in "…" — ignored`.
- The text is everything after the position. Words between the number and the position are ignored
  with `Ignored text before the coordinates`.
- `(color …)` counts only directly after the position. At the end of the text it stays text, with a
  hint.
- Positions are clamped with a diagnostic. Without coordinates the line is kept with
  `Annotation has no position — not drawn; add [visibility, maturity]`.
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

- **The brackets are a maturity range**, not a position. Both values are clamped with a diagnostic.
  An unreadable range is ignored with `Unreadable number in "…"`, and the children may then supply
  the range.
- **Suffixes** after the range: `(color …)` and `(y <vis>)`, then optionally `{`. Anything else, such
  as `label [5, 5]`, `(buy)` or `inertia`, is ignored with a diagnostic. Without a range, trailing
  `(color …)` / `(y …)` groups at the end of the line are the suffixes. Such a group before the
  range is part of the name, with a hint.
- **Name**: the text before the range. It is rewritten like element names (`->` → `→`, …) but never
  made unique, so a pipeline may share its component's name.
- **Height** (visibility) comes from, in order:
  1. `(y <vis>)`, clamped with a diagnostic, or ignored when unreadable;
  2. the visibility of the top-level **component** with the same name, declared before or after;
  3. `0.5`.

  Only that component is the pipeline's _anchor component_. An anchor, accelerator, submap or block
  child of that name gives no height: the pipeline sits at `0.5` unless it has `(y …)`.

- **Range**: explicit, else from the children's smallest and largest maturity. A single child gives
  `[m, m + 0.05]`, silently.
  - **Neither a range nor children** (no tuple, a commented-out one, no block, an empty `{ }`): the
    pipeline is not created, gets no id, and its name is not registered. Its line is kept in
    `rawPassthrough` with
    `Pipeline "X" has no range — not drawn; add [start, end] or child components`, and links to
    `X` get `Link: "X" not found`. Next to a top-level `component X` there is no diagnostic: OWM
    also draws nothing for that pipeline.
  - **An empty or reversed range** (`[0.8, 0.2]`, `[1, 1]`, compared after rounding to 3 decimals)
    becomes `[start, min(1, start + 0.05)]` (a start of `1` becomes `0.95`), with
    `Pipeline "X" range is empty or reversed — changed to [s, e]`.
- **Block**:
  - It opens with `{` as the last character of the pipeline line, or at the start of the next
    statement line (blank and comment lines between are fine).
  - Whatever follows a line-opening `{` is block content, so the one-line
    `{ component Campfire [0.3] }` works. A child line may end with `}`.
  - A second `{`, or a `{` / `}` without a block, is ignored with a diagnostic.
  - A block still open at the end of the file, or at the next `pipeline` line, gives
    `Pipeline block of "X" is never closed — add "}"`, and its children are kept.
  - Outside a block, a `}` at the end of a line is text (`component Set{} [..]`).
- **Children** are `component <Name> [mat]`: the first `[n]` or `[n, n]` tuple on the line decides,
  so a name may hold other brackets (`Store [old] [0.4]`).
  - With **one** number the line is a child. Its maturity is clamped with a diagnostic, and it takes
    the pipeline's height. It accepts decorators, `inertia`, `(color …)` and `label [dx, dy]`; a
    `url(…)` is ignored with a diagnostic.
  - A `[vis, mat]` component inside a block becomes a top-level component, with
    `Component with [visibility, maturity] inside the block of pipeline "X" is not a child — use [maturity]`.
  - Every other line in a block is an ordinary statement and moves out of the block on save.
- **Name resolution**: children are named after the scan, so a child that repeats an existing name
  is renamed `Name 2` with a diagnostic, and the top-level element keeps every link. A link to the
  pipeline's name binds to the anchor, component, accelerator or submap of that name when one
  exists. Otherwise it binds to the pipeline itself, and the Modeler draws a small square on its
  top edge.
- The anchor component's own maturity is independent of the range; the Modeler draws it on the
  box's top edge.

### `evolve`

```text
evolve <Name> <targetMat>
evolve <Name> <targetMat> (build|buy|outsource) label [dx, dy]
evolve <Name>-><New Name> <targetMat>
evolve <Name> -> <New Name> <targetMat> (buy)
```

Sets `movement` on the component `<Name>`: `targetEvolution`, optional `newLabel`, `method` and
`labelOffset`. It is not an element of its own.

- **Parsing is from the end.**
  1. `label [dx, dy]` is taken out wherever it stands.
  2. The last number is the target.
  3. After the target, an optional `(build|buy|outsource)` follows. Anything else there, `(color …)`
     included, is ignored with `Ignored text after the evolve target`.
  4. Everything before the target is the name, so parentheses and numbers stay part of it
     (`Tea (green)`, `Web 2.0`). It is split at the first `->` into old and new name.
- The target must be a plain number (`0.62`, not `0,62`), otherwise the line cannot be interpreted.
  It is clamped with a diagnostic.
- It is resolved after the scan against **components** (pipeline children included). Anchors and
  unknown names give `evolve: component "<Name>" not found`, and the line is kept. When the name
  ends in a method group or `inertia` that belongs elsewhere (`evolve Tea (buy) 0.8`), a hint
  follows: `— for component "Tea", write "(buy)" after the target`.
- A second `evolve` for the same component replaces the first, with
  `Repeated evolve for "X" — replaces the one on line N`. No check that the target lies to the
  right of the current maturity.
- The Modeler draws a red dashed arrow at the component's height to a target circle, labelled with
  the new name (or the old one) and the method. `label [dx, dy]` is stored and written back but
  not yet used for drawing.

### `pioneers`, `settlers`, `townplanners`

```text
pioneers     [vis1, mat1, vis2, mat2] (color …)
settlers     [vis1, mat1, vis2, mat2] (color …)
townplanners [vis1, mat1, vis2, mat2] (color …)
```

→ `AttitudeElement` (`kind`), id `attitude_<kind>`.

- Two opposite corners in any order, normalised to top-left (`position`: higher visibility, lower
  maturity) and bottom-right (`corner2`).
- Values are clamped with a diagnostic. Words between keyword and tuple are ignored with
  `Ignored text before the coordinates`.
- The legacy corner-plus-size form `pioneers [vis, mat] width height` cannot be interpreted.
- Drawn as a translucent rectangle behind everything, labelled with the kind in its top-left
  corner. `(color …)` overrides the default stroke.

### `accelerator`, `deaccelerator`

```text
accelerator   <Name> [vis, mat] (color …)
deaccelerator <Name> [vis, mat] (color …)
```

→ `AcceleratorElement` (`direction: 'accelerate' | 'deaccelerate'`), id `accel_<slug>`. Link
endpoint. Position clamped with a diagnostic. Decorators and `label [dx, dy]` are ignored with a
diagnostic.

### `submap`

```text
submap <Name> [vis, mat] (color …) url(<Def>)
```

→ `SubmapElement`, id `submap_<slug>`, `urlRef` = the resolved address. Link endpoint. Decorators
and `label [dx, dy]` are ignored with a diagnostic.

### `url`

```text
url <Def> [<address>]
```

A named address.

- **Shape.** The name is the text before the first `[`. The address runs from there to the **last**
  `]` (so `]` inside the address is fine), and nothing may follow it. A malformed line cannot be
  interpreted.
- **Comments.** A complete definition is not comment-stripped, so `//` inside the address survives.
  A trailing `// comment` is stripped as usual. Exception: a comment that itself holds `]`
  (`url Docs [https://x] // see [docs]`) becomes part of the address.
- **References.** A definition is referenced by `url(<Def>)` on a `component` or `submap`, declared
  before or after it. `url(<scheme>://…)` with a literal address works too. `mailto:` does not
  (it has no `//`).
- **Diagnostics.**
  - A `url(<Def>)` with no matching definition gives
    `url(Docs) has no matching "url Docs [address]" line — ignored`, and the address is lost on
    save.
  - A repeated definition replaces the earlier one, with
    `Repeated url definition "D" — replaces the one on line N, which is kept unused`.
  - An unreferenced definition is kept in `rawPassthrough` (moved to the end on save) **without** a
    diagnostic.
- **On save**, every element address becomes its own definition `url <Element Name> URL [address]`
  directly after the config lines, referenced as `url(<Element Name> URL)` at the end of the
  element line. `()[]<>` are left out of that name and it is made unique, so `Shop (v2)` gives
  `Shop v2 URL`. A definition shared by two elements is split into two.

### `line`

```text
line [[vis, mat], [vis, mat], …] (closed) (dashed|dotted) (color …)
```

A freeform polyline (Modeler extension) → `DrawingElement`, id `draw_line`, `draw_line_2`, …

- It needs at least two readable points, otherwise the line cannot be interpreted. Unreadable
  entries are dropped with a diagnostic, and points are clamped with a diagnostic.
- `(closed)` makes a polygon. Of `(dashed)` and `(dotted)` the first wins. `(solid)` is the default
  and is never written.

### `(color …)`

`(color #rgb)` … `(color #rrggbbaa)` (3–8 hex digits) or a CSS colour name (`(color teal)`). The
keyword is case-insensitive; the value is kept as written. Allowed after the coordinates of every
element line, directly after an annotation's position, and on pipeline children. An invalid value
(`#12`, `rgb(…)`) is no colour and is ignored with a diagnostic. Inside a note text, an annotation
text or a pipeline name, `(color …)` is plain text. Use the palette hexes from `layout.md` for
review notes.

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

- **Annotation.** The annotation is everything after the **first** `;`, trimmed; an empty one is
  dropped. It may contain `->`, `+>`, a tuple or anything else.
- **`->` wins.** If the part before `;` contains `->` anywhere, the line is a dependency, split at
  the first `->` (`A +> B -> C` is a dependency from `A +> B`). Otherwise the first valid flow
  operator splits it: a `+` that is not the first character, optionally followed by `'value'`, then
  `<>`, `>` or `<`. Spaces around operators are optional (`A->B`, `A+>B`).
- **Flow values.** The value sits between single quotes and cannot contain `'`. `A +'x' B` has no
  direction: `Flow +'x' has no direction — add ">", "<" or "<>"`, and the line is kept. `A ->`
  gives `Link needs a name on both sides`.
- **Reversed flows.** `+<` reverses the direction: `A +< B` is stored as a flow from `B` to `A` and
  written back as `B +> A`. `+<>` sets `bidirectional`.
- **Resolution** happens after the whole file is read, against one name table. It registers, in
  this order:
  1. anchors, components (all forms), accelerators and submaps, in line order;
  2. pipeline names, only if unused;
  3. pipeline children.

  Names are unique by then (see "Element statements"). A reference binds to a name as written first,
  then to an element's new name: `Tea 2` reaches a renamed duplicate when no element was written as
  `Tea 2`. Notes, annotations, regions and drawings are never registered.

- **Unresolved endpoints** give `Link: "<name>" not found`. The message names the left side when it
  is unresolved, else the right. The whole line goes to `rawPassthrough`, and the link does not
  exist on the map.
- Self-links and duplicate links are allowed. There are no chains: `A -> B -> C` looks for an
  element named `B -> C`.
- → `DependencyLink` (`dep_N`) or `FlowLink` (`flow_N`, `flowValue`, `bidirectional`); `label` is the
  annotation. The Modeler draws dependencies as grey lines **without** arrowheads, flows as blue
  lines with arrowheads, the flow value above the midpoint and the annotation in italics at it.

## Comments

- **`// …`** runs to the end of the line.
  - The scanner is **URL-aware**: `//` right after `:` is a scheme separator, so `https://…`
    survives.
  - It is **flow-value-aware**: a `'` opens a quoted section only directly after `+`, and only when
    a closing `'` follows. `+'http://x'>` stays intact, and an apostrophe in a name (`Bob's Shop`)
    does not hide the comment after it.
- **`/* … */`** may span lines; the opening `/*` is found the same way. Comments are stripped left
  to right, so a `/*` inside a `//` comment opens nothing. An unclosed `/*` gives
  `Block comment "/*" is never closed — the rest of the file is a comment`.
- **`*/` outside a block comment** is plain text. It is removed, with a diagnostic, only from a kept
  line that the save would place after an unclosed `/*`.
- Only complete url definitions are exempt from comment stripping.
- **Where comments go.** Comments produce no other diagnostics. They go to `rawPassthrough` (a
  trailing comment is split off its statement) and are written back at the **end of the file**, in
  source order. Lines inside a multi-line block comment keep their indentation.

## Escaping on serialize

The parser already stores names and texts in written form, so for text maps this table changes
nothing on save. It matters for maps edited in the graphical editor.

| Input                                                                             | Written as                                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `->` in a name (anchor, component, child, accelerator, submap, pipeline)          | `→` (U+2192)                                                      |
| `+` before `>`, `<` or `'` in a name                                              | `＋` (U+FF0B)                                                     |
| a leading `{` in a name                                                           | `｛` (U+FF5B)                                                     |
| `//` (not right after `:`) and `/*` in any name or text, outside a flow value     | `∕∕`, `∕*` (U+2215)                                               |
| a line break in a name or text                                                    | a space                                                           |
| a line break in note text                                                         | `\n`                                                              |
| empty name                                                                        | `User` (anchor), `Component`, `Accelerator`, `Submap`, `Pipeline` |
| a name already used by an earlier anchor, component, child, accelerator or submap | `Name 2`, `Name 3`, … (`Name 2 2` if taken)                       |
| leading / trailing spaces in a name                                               | trimmed                                                           |

"Any name or text" covers the title, evolution and y-axis labels, note and annotation text, link
annotations and `evolve` new names. Some text is **not** escaped, and the next parse reads it
differently:

- `;` in a name: links to that element break;
- a `[n, n]` tuple in a name or note text: it becomes the coordinates;
- a `(color …)` at the start of an annotation text: it becomes the colour;
- a flow value containing `->` or a line break: the link breaks.

Since you write the file yourself, keep them out of names and texts.

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

The file ends with a newline. Element lines keep source order, except that pipelines, resolved
after the scan, come after every other element. Pipeline children are emitted only inside their
block, indented by two spaces.

When the Modeler saves after a graphical edit, it uses the same serializer but hands it the
elements in canvas order. The element lines then come out **grouped by kind**:

1. team regions;
2. pipelines (with their blocks);
3. notes;
4. components, accelerators and submaps (in source order);
5. anchors;
6. annotations;
7. drawings.

Config, `url`, `evolve`, link and `rawPassthrough` lines keep the order above.

`rawPassthrough` order:

1. everything collected during the scan, in source order: comments, and unreadable and unknown
   lines;
2. pipelines without a range;
3. unresolved `evolve` lines;
4. unresolved legacy method lines;
5. unused `url` definitions;
6. unresolved links.

An unusable `evolution` or `y-axis` line is removed while parsing when another line sets that
config. The serializer likewise drops such a statement from `rawPassthrough`, but not a comment that
mentions it.

## Round-trip guarantee

`serializeDSL(parseDSL(text))` is canonical text, and canonical text is a **fixed point**: parsing
and serializing it again gives byte-identical text and the same map, **for every input**. This is
fuzz-tested.

The first pass makes these formatting changes, without a diagnostic:

- **Layout.** Blank lines and indentation are removed; keywords are lowercased.
- **Order.**
  - Comments move to the end of the file. Unknown lines and unresolved links move there too; they
    carry their own diagnostic.
  - Config lines move to the top, in the order above; a repeated config line collapses to the last.
  - Pipelines move behind the other elements.
  - `evolve` lines move behind the elements.
- **Legacy forms.** `market X …`, `ecosystem X …` and `buy X [..]` become
  `component X … (market|ecosystem|buy)`. A standalone `buy X` is folded into `X`'s decorator.
- **Suffixes.**
  - Decorators are normalised to one group in the order `market, ecosystem, method`, and
    `(inertia)` becomes a trailing `inertia`.
  - Component suffixes are reordered to `(…) inertia (color …) label [dx, dy] url(…)`.
  - Annotations get their number written out and their colour moved before the text.
- **`url` definitions** are renamed `<Element> URL` and moved to the top. A literal
  `url(scheme://…)` becomes a definition.
- **Pipelines.**
  - A missing range is filled in from the children.
  - `{` and `}` go on lines of their own, each child on its own line.
  - Lines that are not children move out of the block.
  - `(y …)` is added or dropped as needed.
- **Regions.** Corners are normalised, top-left first.
- **`evolve` renames** are written without spaces (`A->B`).
- **Links.** `+<` becomes the reversed `+>`, link spacing is normalised (`A -> B`, `A +'v'> B`), and
  an empty `;` annotation is dropped.
- **Numbers** are rounded to 3 decimals, and clamped values are written clamped.

These changes come with a diagnostic:

- ignored suffix text, orphan braces and stray `*/` disappear;
- renamed names (`Name 2`, `→`, `＋`, `｛`) are written in their new form;
- an unusable `evolution` / `y-axis` line is dropped when another one sets that config.

Labels, note text, colours, label offsets, unknown lines and comment text survive unchanged.

## Diagnostics catalogue

`parseDSLWithDiagnostics(text)` returns `{ map, diagnostics }`. Each diagnostic is
`{ line, message, text }`, with a 1-based line number and the trimmed source line. Diagnostics found
while reading a line come in line order. Those resolved after the scan follow:

1. unusable config lines;
2. pipelines;
3. `evolve`;
4. legacy methods;
5. url references;
6. links;
7. `*/` removals.

Sort by `line` for source order. A line can have several diagnostics. Each diagnostic marks a line
that was not used exactly as written. Either the line is kept unchanged in `rawPassthrough` and has
no effect on the map, or part of it was dropped or changed.

**Lines that are not used** (all kept):

| Message                                                                       | Cause                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Line could not be interpreted (kept losslessly in rawPassthrough)`           | a known keyword with unreadable content, see the list below                                                                                                                                                                            |
| `Unknown statement "<word>"`                                                  | the first word is no keyword and the line is no link: a typo (`compnent`), free text                                                                                                                                                   |
| `Link needs a name on both sides`                                             | `A ->`, `-> B`                                                                                                                                                                                                                         |
| `Flow +'<v>' has no direction — add ">", "<" or "<>"`                         | `A +'5' B`                                                                                                                                                                                                                             |
| `Link: "<name>" not found`                                                    | an endpoint is undeclared, misspelled, differs in case or spacing, is commented out, is a note, annotation, region or range-less pipeline, contains `;`, or is a chain (`A -> B -> C`). Declare the element and copy its name exactly. |
| `evolve: component "<Name>" not found`                                        | no component has that name (typo, case, an anchor); may add a hint to move `(buy)` after the target or `inertia` to the component line                                                                                                 |
| `build: component "<Name>" not found` (also `buy:`, `outsource:`)             | a legacy standalone method line names an unknown component                                                                                                                                                                             |
| `buy: needs a component name — not used`                                      | a bare `build` / `buy` / `outsource`                                                                                                                                                                                                   |
| `Annotation has no position — not drawn; add [visibility, maturity]`          | `annotation` without coordinates                                                                                                                                                                                                       |
| `Annotations box has no position — not used; add [visibility, maturity]`      | `annotations` without coordinates                                                                                                                                                                                                      |
| `Evolution needs exactly four stages, found N — not used`                     | an `evolution` line with another number of parts; with `— removed; another "evolution" line sets it` the line is dropped instead                                                                                                       |
| `y-axis has no label — not used`                                              | an empty `y-axis`; with `— removed; …` as above                                                                                                                                                                                        |
| `Pipeline "X" has no range — not drawn; add [start, end] or child components` | a pipeline with neither range nor children                                                                                                                                                                                             |
| `Block comment "/*" is never closed — the rest of the file is a comment`      | an unclosed `/*`                                                                                                                                                                                                                       |

`Line could not be interpreted` causes:

- `anchor`, `component`, `market`, `ecosystem`, `note`, `accelerator`, `deaccelerator` or `submap`
  without a readable `[vis, mat]` (missing, `1e-3`, `0,5`), or, except for notes, with an empty
  name;
- `pipeline` without a name; `evolve` without a name or a plain-number target;
- `style` with an unknown value; `size` without a readable `[w, h]`;
- an annotation number beyond `2^53`, or a position list without one readable entry;
- `line` with fewer than two points; a region without four numbers (including the legacy
  `[vis, mat] width height` form); a malformed `url` line;
- a keyword-first link with undeclared names whose statement cannot be read
  (`Line Manager -> X`, `Style Guide -> X`, `Size Calc -> X`, `Evolve Rate -> X`).

**Text that was changed** (the element still exists):

| Message                                                                                                    | Cause                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Link: "<right>" not found — read as a "<keyword>" statement`                                              | a keyword-first link (`Title Search -> Ghost`) whose left name is declared and right name is not; the line became the statement |
| `Coordinate N is outside [0,1] and was clamped`                                                            | any position, pipeline range, `(y …)`, child maturity, region corner, `line` point or `evolve` target                           |
| `Unreadable number in "<text>" — ignored`                                                                  | `(y 0.4.1)`, `label [1.2.3, 4]`, an unreadable pipeline range or list entry, a label or `(y …)` value beyond `10^12`            |
| `Ignored text after the coordinates: "<text>", …`                                                          | suffix text the statement cannot hold: unknown decorators, stray words, repeats, a `label` on a note                            |
| `Ignored text before the coordinates: "<text>"`                                                            | words before the tuple of a region, `size`, `annotations` or `line`, or between an annotation's number and position             |
| `Ignored text after the evolve target: "<text>"`                                                           | anything after an `evolve` target other than one method                                                                         |
| `"(color …)" before the coordinates is read as part of the text — write it after them`                     | a colour at the end of a note text; for a pipeline the message says "name"                                                      |
| `"(color …)" after the annotation text is read as part of the text — write it directly after the position` | a colour at the end of an annotation text                                                                                       |
| `Duplicate name "X" — renamed to "X 2"; links bind to the first "X"`                                       | a name used by an earlier anchor, component, child, accelerator or submap                                                       |
| `Name "A->B" renamed to "A→B" — a name cannot hold link operators …`                                       | `->`, `+>`, `+<`, `+'` or a leading `{` in a name                                                                               |
| `"<text>" read as "<escaped>" — "//" or "/*" there would start a comment once saved`                       | a comment marker in a text that only a flow value elsewhere on the line protected                                               |
| `Pipeline "X" range is empty or reversed — changed to [s, e]`                                              | `end ≤ start`                                                                                                                   |
| `Ignored "{" — a block must directly follow a pipeline line`                                               | a `{` not right after a pipeline line, or a second `{`                                                                          |
| `Ignored "}" — no pipeline block is open`                                                                  | a `}` without a block                                                                                                           |
| `Pipeline block of "X" is never closed — add "}"`                                                          | a block open at the end of the file or at the next `pipeline` line                                                              |
| `Component with [visibility, maturity] inside the block of pipeline "X" is not a child — use [maturity]`   | a two-number component inside a block; it becomes top-level                                                                     |
| `Repeated "<keyword>" — replaces the one on line N`                                                        | a second `title`, `style`, `size`, `evolution`, `y-axis` or `annotations`                                                       |
| `Repeated evolve for "X" — replaces the one on line N`                                                     | a second `evolve` for one component                                                                                             |
| `buy: "X" already has the method "build" — replaced`                                                       | a legacy method line overrides a decorator                                                                                      |
| `y-axis takes "Label" or "Label->Bottom->Top" — read as "…"`                                               | a `y-axis` with two, or more than three, parts, or empty parts                                                                  |
| `url(<Def>) has no matching "url <Def> [address]" line — ignored`                                          | a missing definition, or `url(mailto:…)`; the address is lost                                                                   |
| `Repeated url definition "D" — replaces the one on line N, which is kept unused`                           | two definitions with one name                                                                                                   |
| `Ignored "*/" — this line is kept after an unclosed "/*" and would end that comment`                       | a kept line holding `*/` that the save would place inside an unclosed block comment                                             |

### Silent cases (no diagnostic)

An empty `diagnostics` array means almost everything was read as written. These are the exceptions:

| Input                                                               | What happens                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| swapped coordinates `[maturity, visibility]`                        | the map is mirrored                                           |
| a typo inside the coordinates (`[0.55. 0.18]`) before another tuple | the later tuple becomes the position, the rest joins the name |
| `Title Search -> X` while `Title Search` is not declared            | **replaces the map title**; no link                           |
| `Y-axis A -> B -> C` while `Y-axis A` is not declared               | sets the y-axis label and end labels; no link                 |
| `url <Def> [address]` that nothing references                       | kept in `rawPassthrough`, moved to the end                    |
| `pipeline X` without range next to a top-level `component X`        | kept, nothing drawn                                           |
| a pipeline with a single child                                      | range `[m, m + 0.05]`                                         |
| a pipeline named like an anchor, accelerator or submap only         | height `0.5` unless `(y …)`                                   |
| `url Docs [https://x] // see [docs]`                                | the comment becomes part of the address                       |
| blank lines; comments                                               | removed; moved to the end of the file                         |

The validation recipe in `api.md` therefore also lists every non-comment `rawPassthrough` entry,
prints the title and the link count, and compares the file with its canonical text.

## Id allocation

Ids exist for every element and edge but never appear in the text. They matter only for the JSON
form and the API.

- **Elements**: `<prefix>_<slug>` of the element's (renamed) name, with `_2`, `_3`, … on collision.
  So a duplicate `Tea` renamed `Tea 2` gets `cmp_tea_2`.
  - `slug` lowercases and turns every run of characters outside `a-z0-9` into `_`, trimming one
    leading and one trailing `_`.
  - An empty result becomes `x` (`数据` → `cmp_x`).
- **Prefixes**:
  - `anchor`;
  - `cmp`, for components in every form and pipeline children;
  - `note`, the slug of the text;
  - `anno_<number>`;
  - `pipeline`;
  - `attitude_<kind>`;
  - `accel`, for both directions;
  - `submap`;
  - `draw_line`.
- Allocation follows scan order, then pipelines and their children, so ids depend on line order. Do
  not rely on them across edits. A pipeline without a range gets no id.
- **Edges**: `dep_1`, `dep_2`, … and `flow_1`, `flow_2`, … in link order. Elements and edges share
  one namespace in the Modeler; the prefixes keep them apart.

## Forms from other OWM documentation

Other OWM tools and guides use a few forms this parser reads differently:

| Written elsewhere                                | What happens here                              | Write instead                               |
| ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------- |
| `pioneers [0.6, 0.05] 0.35 0.35` (corner + size) | diagnostic, no region                          | `pioneers [0.6, 0.05, 0.25, 0.4]` (corners) |
| `annotation 1 [[0.38, 0.44]] Text` (one tuple)   | fine, a single position                        | —                                           |
| `y-axis Value Chain -> Invisible` (two parts)    | `Invisible` dropped, with a diagnostic         | `y-axis Value Chain->Invisible->Visible`    |
| `url Name [address]` without `url(Name)`         | not attached to anything                       | add `url(Name)` to the element line         |
| `evolve Tea (buy) 0.8` (method before target)    | looks for `Tea (buy)`, with a hint             | `evolve Tea 0.8 (buy)`                      |
| `Business->Cup of Tea` (no spaces)               | fine, written back as `Business -> Cup of Tea` | —                                           |
| `build Cup of Tea` (standalone)                  | fine, folded into `(build)`                    | `component Cup of Tea [..] (build)`         |
| `pipeline X {` with children and no range        | fine, range taken from the children            | —                                           |
