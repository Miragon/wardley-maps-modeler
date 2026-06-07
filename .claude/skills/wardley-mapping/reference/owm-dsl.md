# OWM text DSL — reference (as supported by this project)

`.wmap` / `.owm` files are plain text in the Online-Wardley-Maps DSL. Line-oriented; one statement
per line; element names may contain spaces. Coordinates are `[visibility, maturity]`, both `0..1`
(**visibility** 1=top/visible, 0=bottom; **maturity** 0=genesis/left, 1=commodity/right). Stage
boundaries here: `0.17 / 0.40 / 0.70`.

## Statements

| Syntax                                                        | Meaning                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `title <text>`                                                | Map title                                                        |
| `anchor <Name> [vis, mat]`                                    | User / anchor (put real users near the top)                      |
| `component <Name> [vis, mat]`                                 | A capability/component                                           |
| `component <Name> [vis, mat] (build\|buy\|outsource)`         | + sourcing method decorator                                      |
| `component <Name> [vis, mat] (market)` / `(ecosystem)`        | + market / ecosystem decorator                                   |
| `component <Name> [vis, mat] inertia`                         | + inertia marker (resistance to change)                          |
| `evolve <Name> <mat>`                                         | Planned evolution to maturity `<mat>` (draws the movement arrow) |
| `evolve <Name>-><NewName> <mat> (method)`                     | evolve + rename + optional method                                |
| `pipeline <Name> [matStart, matEnd]`                          | Pipeline band across a maturity range                            |
| `<A> -> <B>`                                                  | Dependency: A needs B (A above B)                                |
| `<A> -> <B>; <text>`                                          | Dependency with an annotation label                              |
| `<A> +> <B>` / `+<> ` / `+< `                                 | Flow link (directed / bidirectional / reversed)                  |
| `<A> +'<value>'> <B>`                                         | Flow with a value label (e.g. money/time)                        |
| `note <text> [vis, mat]`                                      | Free-text note                                                   |
| `note <text> [vis, mat] (color <hex\|name>)`                  | **Coloured note (this project's extension)**                     |
| `annotation <n> [vis, mat] <text>` + `annotations [vis, mat]` | Numbered annotation + its legend box                             |
| `pioneers\|settlers\|townplanners [vis, mat] <w> <h>`         | Attitude region (PST), size in px                                |
| `accelerator\|deaccelerator <Name> [vis, mat]`                | Accelerate / slow evolution marker                               |
| `submap <Name> [vis, mat]`                                    | Submap reference                                                 |
| `style wardley\|handwritten\|colour\|dark`                    | Visual style                                                     |
| `size [w, h]`                                                 | Map plot size                                                    |
| `evolution <l1>-><l2>-><l3>-><l4>`                            | Custom x-axis stage labels                                       |
| `y-axis <label>`                                              | Custom y-axis label                                              |

Unknown lines are preserved losslessly (round-trip safe), so it is safe to add notes without
disturbing the rest of a file.

## Coloured notes (feedback)

Per-note colour is a project extension placed **after** the coordinates so standard OWM tools simply
ignore it: `note <text> [vis, mat] (color #rrggbb)`. A CSS colour name also works (`(color red)`),
but prefer the palette hexes below so colours stay consistent and meaningful.

| Colour | Hex       | Use for                              |
| ------ | --------- | ------------------------------------ |
| Green  | `#15803d` | Good / strength / well placed        |
| Amber  | `#b45309` | Watch / caution / inertia risk       |
| Red    | `#b91c1c` | Problem / risk / misplaced / missing |
| Blue   | `#1d4ed8` | Info / neutral observation           |
| Teal   | `#0e7c74` | (free)                               |
| Purple | `#7e22ce` | Idea / opportunity / suggested play  |
| Pink   | `#be185d` | (free)                               |
| Slate  | `#475569` | Neutral / de-emphasised              |

The editor's note colour picker offers exactly these eight plus "no colour".

## Worked example — a map + a review appended as coloured notes

Input map:

```
title Tea Shop
anchor Public [0.95, 0.78]
component Cup of Tea [0.79, 0.61]
component Hot Water [0.52, 0.80]
component Kettle [0.43, 0.35]
component Power [0.10, 0.71] (outsource)
Public -> Cup of Tea
Cup of Tea -> Hot Water
Hot Water -> Kettle
Kettle -> Power
```

A review (added lines only — the original is untouched). Notes sit just beside the component they
comment on:

```
note Well anchored to a real user need [0.99, 0.70] (color #15803d)
note Kettle is a product/commodity — buying beats building [0.47, 0.30] (color #b91c1c)
note Consider evolving Kettle to product (rent/utility) [0.38, 0.55] (color #7e22ce)
note Power already outsourced — good [0.06, 0.74] (color #15803d)
note Hot Water sits low but is fairly novel here — sanity-check maturity [0.56, 0.74] (color #b45309)
```

Guidelines when writing review notes:

- Keep each note to a handful of words; put the detail in the written assessment.
- Offset the note from the node (≈ `0.03–0.06` in vis/mat) so it doesn't cover the circle or label.
- Use one colour per intent (table above); don't rainbow every note.
- Only add notes (and, if asked, `evolve` arrows) — don't silently move the user's components.
