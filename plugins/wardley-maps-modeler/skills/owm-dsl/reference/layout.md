# `.wmap` / `.owm` — layout and geometry

Coordinates are the part of a generated map that most often comes out wrong: components overlap,
labels run into each other, notes cover what they comment on, or the value chain points upwards.
This file has the numbers — taken from the Wardley Maps Modeler's renderer — and a worked map.

## Coordinate system

- `[visibility, maturity]` — **visibility first** (the y axis), maturity second (the x axis).
- Visibility `1` is the top of the map (visible to the user), `0` the bottom. Maturity `0` is
  genesis on the left, `1` commodity on the right.
- Both are normalised to `0…1`; values outside are clamped. There is no grid and no snapping in the
  text.
- A position addresses the **centre** of a component, anchor, note, accelerator, submap or
  annotation marker. A pipeline has a maturity range plus a height; a team region has two corners.
- `label [dx, dy]` and `size [w, h]` are in **pixels**.

The Modeler projects map units onto its plot area (default `1080 × 680` px, inside a margin of
66 px left and 38 px top):

```text
x = 66 + maturity × 1080
y = 38 + (1 − visibility) × 680
```

So at the default size `0.1` maturity ≈ **108 px** and `0.1` visibility ≈ **68 px**. A `size` line
changes these factors, not the coordinates; label offsets and note boxes stay the same pixel size.

## What each element occupies

| Element       | Shape                                         | Label / text                                    |
| ------------- | --------------------------------------------- | ----------------------------------------------- |
| `component`   | circle Ø 30 px                                | right of the circle (details below)             |
| `inertia`     | thick bar 18 px right of the centre           | —                                               |
| `(ecosystem)` | dotted ring Ø 37 px                           | —                                               |
| `anchor`      | person icon 26 px                             | bold, centred above the icon                    |
| `note`        | box centred on the coordinate (details below) | italic, inside the box                          |
| `pipeline`    | dashed box 30 px high, top edge at its height | children 15 px below the top edge               |
| `evolve`      | red dashed line to a Ø 30 px target circle    | right of the target, method below               |
| `annotation`  | numbered marker Ø 20 px                       | 15 px right of the marker's centre, 12 px font  |
| `accelerator` | arrow icon 24 px                              | 15 px right of the centre                       |
| `submap`      | double square 32 px                           | right of the square                             |
| region        | translucent rectangle, behind everything      | the kind (`Pioneers`, …) in the top-left        |
| links         | straight lines between centres                | flow value above the midpoint, annotation at it |

- **Component**: the circle covers `± 0.014` maturity and `± 0.022` visibility. The label starts
  22 px right of the centre, 13 px font, ≈ 7 px per character, so a name of `n` characters reaches
  `(22 + 7n) / 1080` maturity to the right — ≈ `0.085` for 10 characters, ≈ `0.15` for 20. The
  method word (`buy`, …) sits in small type below the label.
- **Note**: ≈ `7.5 × characters + 16` px wide, `17 × lines + 12` px high, at least 34 × 34 px.
- **Links** attach to element centres; a standalone pipeline's links attach to the middle of its
  top edge.

## The default grid

```text
visibility 0.90 – 0.97   anchors — the users
           0.70 – 0.88   what the user touches directly; the need itself
           0.35 – 0.65   supporting capabilities
           0.05 – 0.30   infrastructure and utilities (power, compute, network)
maturity   0 – 0.17 genesis · 0.17 – 0.40 custom-built · 0.40 – 0.70 product · 0.70 – 1 commodity
```

- Keep anchors at or below `0.97` — the anchor's label sits about 30 px above its centre.
- Keep everything at or above `0.05` visibility, so labels and method words stay on the plot.
- With four to six levels in the value chain, step `0.12–0.18` visibility per level. A component
  sits **below everything that depends on it**: for every `A -> B`, `visibility(A) > visibility(B)`.
  A dependency pointing upwards means the value chain is upside down or the link is reversed.
- Maturity is the component's real evolution stage — it is _content_, not layout. Never shift a
  component across a stage boundary to make room; move it up or down a little instead.

## Spacing

Verified against the renderer's geometry:

- **Same column** (similar maturity): `Δvisibility ≥ 0.06`. At `0.05` the circles are only 4 px
  apart.
- **Same row** (similar visibility): `Δmaturity ≥ (7 × characters of the left name + 40) / 1080` —
  `0.1` for a 10-character name, `0.17` for 20. At `0.08` a 9-character label runs into the next
  circle.
- **Crowded row**: stagger heights by `0.06` rather than pushing components along the maturity
  axis.
- **Right edge**: a component at maturity `> 0.85` with a long name runs off the plot. Shorten the
  name or move the label to the left (next section).
- **Lines**: links are straight. If one passes through an unrelated circle, nudge that component's
  visibility.

## Label offsets

`label [dx, dy]` moves a label by pixels from its default place: `dx` to the right, `dy`
**downwards** (screen coordinates). Supported on `anchor`, `component`, pipeline children and
`evolve` (stored, but the Modeler does not yet use it for the evolve label). Not on notes,
pipelines, accelerators or submaps — there it is dropped or, worse, becomes part of the text.

For a component name of `n` characters:

| Label position           | Offset                      | Example, `Kettle` (n = 6) |
| ------------------------ | --------------------------- | ------------------------- |
| right (default)          | none                        | —                         |
| left of the circle       | `label [-(7n + 45), 0]`     | `label [-87, 0]`          |
| centred above the circle | `label [-(22 + 3.5n), -18]` | `label [-43, -18]`        |
| centred below the circle | `label [-(22 + 3.5n), 32]`  | `label [-43, 32]`         |

Use offsets sparingly — to rescue a label that collides with a link or a neighbour, or that runs
off the right edge. Respect offsets the user set by hand.

## Pipelines

```text
component Kettle [0.43, 0.6]
pipeline Kettle [0.25, 0.92]
{
  component Campfire Kettle [0.3]
  component Electric Kettle [0.82] (buy)
}
```

- The pipeline's top edge runs through the centre of its **anchor component** (the component with
  the same name); the children sit 15 px below that line, inside the box, all at one height.
- Keep the anchor component at least `0.1` maturity away from every child — directly above a child
  the two circles overlap. Placing it at a free spot in the range or at one end works well.
- Range: from about `0.04` left of the leftmost child to about `0.04` right of the rightmost. Child
  labels may run past the dashed outline; that is fine.
- Space children like row neighbours (`Δmaturity` rule above).
- Leave about `0.08` visibility free below the pipeline's height for the box and the child labels.
- A **standalone** pipeline (no component of that name) needs `(y <visibility>)` — without it, it
  sits at `0.5`. The Modeler then draws a small square with the name on the top edge, and that is
  where links attach.

## Team regions (pioneers, settlers, town planners)

```text
pioneers [0.72, 0.02, 0.48, 0.3]
settlers [0.72, 0.32, 0.48, 0.66]
townplanners [0.4, 0.68, 0.05, 0.98]
```

- Two corners `[vis1, mat1, vis2, mat2]`, any order; the parser normalises them to top-left and
  bottom-right. All in map units.
- Regions are drawn translucent and behind everything else, so they never hide a component.
- The kind's name sits just inside the top-left corner (about 10 px in, 18 px down): start a region
  about `0.03` visibility above its highest component and keep that corner free.
- Size each region to the components that team owns, with about `0.03` margin around their circles.
  Typical columns follow evolution: pioneers over genesis and early custom-built (≈ `0–0.35`),
  settlers over custom-built to product (≈ `0.3–0.7`), town planners over product and commodity
  (≈ `0.65–1`).
- Overlapping regions are legal but hard to read; leave a small gap between neighbours.
- Default borders are blue for pioneers, amber for settlers and green for town planners;
  `(color …)` overrides border and label.

## Notes and review feedback

- A note is a box **centred on its coordinate**: about `7.5 × characters + 16` px wide, so a
  30-character note is ≈ 240 px (`0.22` maturity) wide. Keep notes under ~40 characters; for more,
  break the line with `\n` (each line adds 17 px).
- Place commentary **`0.06` visibility above or below** the component it is about, at the same
  maturity. `0.05` just clears the circle and the method word; `0.04` overlaps them.
- Keep the whole box on the plot: the maturity must be at least half the note's width from either
  edge — for 30 characters, between `0.12` and `0.88`.
- Notes cannot be link endpoints. Point at an area by placing the note next to it.
- Append review notes; never move the user's components to make room — suggest moves in the notes.

### Note colours

The Modeler's note colour picker offers exactly these eight colours (plus "no colour"). Use the hex
values verbatim and one meaning per colour, so feedback reads at a glance:

| Colour | Hex       | Meaning                                    |
| ------ | --------- | ------------------------------------------ |
| Green  | `#0B7A55` | Good — a genuine strength, well placed     |
| Amber  | `#92610A` | Watch — inertia risk, needs attention      |
| Red    | `#C92A2A` | Problem — misplaced, risky or missing      |
| Blue   | `#2B50D4` | Info — a neutral observation               |
| Purple | `#6A3DB8` | Idea — an opportunity or a suggested play  |
| Teal   | `#0E8181` | Free — a second information category       |
| Pink   | `#C2185B` | Free — a further category the user defines |
| Slate  | `#4A4A4A` | Neutral — de-emphasised remarks            |

```text
note Genuine differentiator, keep in-house [0.56, 0.2] (color #0B7A55)
note Sunk cost in the old CRM: expect inertia [0.4, 0.33] (color #92610A)
note Compute is a utility, stop building it [0.16, 0.9] (color #C92A2A)
note Open the catalogue as an API [0.7, 0.66] (color #6A3DB8)
```

## Worked map

As printed it is canonical text: zero diagnostics, nothing in `rawPassthrough`, and
`serializeDSL(parseDSL(…))` returns it byte-identically. Measured against the geometry above, no
circle, label or note overlaps another.

```owm
title Online Bookshop
anchor Reader [0.96, 0.52]
component Book Purchase [0.87, 0.52]
component Storefront [0.76, 0.36] (build)
component Recommendations [0.62, 0.2] (build)
component Catalogue [0.64, 0.66] (buy)
component Payment [0.5, 0.82] (outsource)
component Customer Data [0.46, 0.33] inertia
component Delivery [0.34, 0.72]
component Compute [0.1, 0.9] (outsource)
note Differentiator, keep in-house [0.56, 0.2] (color #0B7A55)
note Legacy CRM slows every change [0.4, 0.33] (color #92610A)
note Courier market is mature [0.22, 0.86] (color #2B50D4)
pipeline Delivery [0.5, 0.95]
{
  component Own Fleet [0.56] inertia
  component Courier Network [0.86] (outsource)
}
evolve Recommendations 0.45 (buy)
Reader -> Book Purchase
Book Purchase -> Storefront
Book Purchase -> Delivery
Storefront -> Recommendations
Storefront -> Catalogue
Storefront -> Payment; card and wallet
Storefront +'orders'> Delivery
Recommendations -> Customer Data
Catalogue -> Compute
Payment -> Compute
Customer Data -> Compute
```

Reading it: the reader's need is a book purchase, served by a custom-built storefront. Underneath,
recommendations are the novel part (built in-house, expected to become a buyable product —
`evolve … (buy)`), while catalogue, payment and compute are bought or outsourced. Customer data
carries inertia, flagged by an amber note right below it. Delivery is a pipeline from the company's
own fleet (inertia) to an outsourced courier network; the storefront hands it orders as a flow.

How the numbers were chosen:

- Levels step down `0.96 → 0.87 → 0.76 → 0.62/0.64 → 0.46/0.50 → 0.34 → 0.10`; every dependency
  points down.
- `Recommendations` (15 characters) at maturity `0.2` and `Catalogue` at `0.66` leave room for the
  evolve target at `0.45` and its label.
- `Delivery` sits at `0.72`, `0.16` away from `Own Fleet` and `0.14` from `Courier Network`, so the
  anchor component does not sit on a child.
- Each note is `0.06` below its component (`0.62 → 0.56`, `0.46 → 0.40`), or well clear of the
  pipeline children it talks about.
