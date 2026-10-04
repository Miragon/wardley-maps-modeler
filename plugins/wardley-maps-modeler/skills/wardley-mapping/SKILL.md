---
name: wardley-mapping
description: >-
  Wardley Mapping expert. Explains Simon Wardley's method (value chain, evolution stages,
  climatic patterns, doctrine, gameplay, pioneers/settlers/town planners), creates a Wardley Map
  from a strategic question, and reviews a user's map — what is good, what is weak, where the
  potential is — by writing the .wmap/.owm file directly, with colour-coded feedback notes, for
  the Wardley Maps Modeler (web app, VS Code extension, Miragon AI Design) to render. Use whenever
  the user asks to create, draft, review, critique, improve or sanity-check a Wardley map, to
  assess a component's evolution stage, to decide build vs buy vs outsource from a map, or to
  explain Wardley-mapping concepts. For the OWM text format itself — grammar, coordinates,
  decorators, diagnostics, round-trip — use the `owm-dsl` skill.
---

# Wardley Mapping

A Wardley Map (Simon Wardley) is a **picture of a landscape**: a user and their need at the top,
the chain of components that need depends on beneath it, and every component placed by **how
evolved** it is, from novel (left) to commodity (right). Unlike a box-and-arrow diagram, position
carries meaning and things move — so you can reason about what will change and what to do about it.
This skill lets you (1) **explain** the method, (2) **create** a map from a strategic question and
(3) **review** a map and return actionable, colour-coded feedback.

## The map is a file — write it, never draw it

Maps live as plain-text `.wmap` (or `.owm`) files in the OWM DSL. The **Wardley Maps Modeler**
renders them: the VS Code extension (`miragon-gmbh.wardley-mapping-modeler`) opens them as a visual
editor, **Miragon AI Design** renders the file you write, and the web app
(https://wardley-maps.modeler.miragon.io) opens a saved `.wmap`/`.owm` file (**Menu → Open…** or
drag and drop) or a `#mz=` share link. It has no field to paste map text into.

- Creating or reviewing a map **always means writing the `.wmap` file directly**. Do not render it
  yourself: no React/HTML/SVG artifacts, no images, no ASCII drawings.
- Without a file system (plain chat), output the complete file in one fenced block and tell the
  user to save it as `<name>.wmap` and open or drop it in the web app or VS Code. If you can run
  Node, also give a share link (`owm-dsl` skill, "Opening the map").
- The **`owm-dsl` skill** (shipped alongside this one) owns the format: grammar, coordinates,
  decorators, layout, diagnostics, round-trip. Load it whenever you read or write a file.

## The two axes (always check these first)

- **Y — value chain / visibility.** Top = visible to the user, bottom = invisible plumbing. A
  component sits **above** what it depends on. The map is **anchored** by a user (`anchor`) with a
  need directly beneath. No user and no need = not a map yet, just a diagram.
- **X — evolution.** Left → right, driven by supply **and** demand competition: **Genesis →
  Custom-Built → Product (+rental) → Commodity (+utility)**. Things only move right over time. The
  modeler's stage boundaries are `0.17 / 0.40 / 0.70`: Genesis `0–0.17`, Custom-Built
  `0.17–0.40`, Product `0.40–0.70`, Commodity `0.70–1.0`.

Coordinates are `[visibility, maturity]` — **y first**, both `0..1`. Writing `[x, y]` out of habit
is the most common way to get a map wrong.

## Handling requests

| The user says…                        | Do this                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| "What is evolution / doctrine / PST?" | Explain from `reference/concepts.md` or `reference/doctrine.md`. Show a tiny example as a fenced block in chat; never write it into the open map. |
| "Explain X on my map"                 | Explain X, then point at named components in the file. If X is absent (no `inertia` marked), say where it likely sits. Edit only when asked.      |
| "Create a Wardley map for X"          | Full workflow in `reference/creating-maps.md` → write the `.wmap` → commentary in chat.                                                           |
| "Review / critique this map"          | `reference/review-playbook.md` → add notes to the file → written assessment.                                                                      |
| "What stage is X at?"                 | `reference/evolution-assessment.md`: stage, maturity value, evidence.                                                                             |
| "Compare our map with the industry"   | Check placements against the usual suspects (`review-playbook.md` §3) and the context heuristics (`evolution-assessment.md`).                     |
| "Build or buy X?"                     | Assess the stage first; software components also `reference/ai-era-patterns.md`.                                                                  |
| "Add / move / rename X"               | Edit the file in place (`owm-dsl` rules), keep every other line as it was; re-check links.                                                        |
| "Explain this map to me"              | Read the file and narrate top-down: user, need, chain, stages, movement, inertia.                                                                 |
| A screenshot or image of a map        | Ask for the file. If there is none, transcribe it into a `.wmap`, then confirm positions with the user before drawing conclusions.                |

If the strategic question or the user is unclear, ask — the map's value comes from the user's
domain knowledge. If they want a quick draft anyway, state your assumptions in the commentary.

## Creating a map

1. **Purpose first:** the strategic question the map must answer, the user (anchor), their 1–4
   needs, the scope.
2. **Value chain backwards** from each need down to commodities. 8–15 components, noun names, every
   component linked, the chain ends in things you buy or rent.
3. **Evolution, with evidence:** place each component by its market characteristics and write a
   one-sentence rationale per placement (`reference/evolution-assessment.md`).
4. **Movement:** `evolve` arrows for expected moves (always rightward), `inertia` where resistance
   is real, `(build)`/`(buy)`/`(outsource)` where sourcing matters.
5. **Write and validate the file**, then **run the review below on your own map** before
   presenting it.
6. **Reply with a short strategic commentary** — template in `reference/creating-maps.md`.

## Reviewing a map (the core job)

1. **Read the file** and build a mental model: anchors, components, links, positions, `evolve`
   arrows, decorators, pipelines, existing notes. Run the check script from the `owm-dsl` skill if
   you can — diagnostics like `Link: "X" not found`, lines the parser did not understand
   (non-comment `rawPassthrough`), a parse that throws and a parsed title that differs from the
   file's `title` line are all review findings, not noise.
2. **Structure:** user and need at the top? Dependencies pointing down? Links that silently don't
   exist, orphans, cycles? Does the chain reach commodities?
3. **Evolution:** is each stage realistic? Commodities placed too far left (compute, storage,
   payments, identity) are the classic error; differentiators drawn as commodities the dangerous
   one.
4. **Climate** (`reference/concepts.md`): what will evolve, where inertia sits, what
   commoditisation will enable, which practices must co-evolve.
5. **Doctrine** (`reference/doctrine.md`): user focus, appropriate methods per stage, duplication,
   inertia management, team structure (PST).
6. **Gameplay:** 1–3 concrete plays tied to specific components and their stage.
7. **Deliver two ways:** a short written assessment — **Strengths**, **Weaknesses & risks**,
   **Potential & plays** — and colour-coded notes in the file, next to the component they comment
   on.

`reference/review-playbook.md` has every check, how to detect it and how to word the note.

## Colour convention for feedback notes

Notes take a colour override after the coordinates, spelt `(color #hex)` — American spelling.
`(colour …)` is not recognised: it silently becomes part of the note text and the note stays
uncoloured, without any diagnostic. Use exactly these values — they are the modeler's note
palette, so the colour picker recognises them:

| Colour | Hex       | Meaning                                   |
| ------ | --------- | ----------------------------------------- |
| Green  | `#0B7A55` | Good — well placed, a genuine strength    |
| Amber  | `#92610A` | Watch — inertia risk, doubtful placement  |
| Red    | `#C92A2A` | Problem — misplaced, missing, broken link |
| Blue   | `#2B50D4` | Info — neutral observation                |
| Purple | `#6A3DB8` | Idea — opportunity, suggested play        |
| Teal   | `#0E8181` | Free — e.g. the user's own categories     |
| Pink   | `#C2185B` | Free                                      |
| Slate  | `#4A4A4A` | Neutral, de-emphasised (legend, metadata) |

```text
note Clear user need — good anchor [0.95, 0.78] (color #0B7A55)
note Compute is a commodity — rent it [0.05, 0.35] (color #C92A2A)
note Inertia likely: sunk cost [0.38, 0.4] (color #92610A)
note Expose as API — platform play [0.57, 0.7] (color #6A3DB8)
```

- **Preserve the user's map.** Only add notes. Every other line stays byte-identical.
- **Suggest moves, don't make them.** Say "evolve Kettle to ~0.6" in a note or the assessment;
  move components or add `evolve` arrows only when the user asks.
- **A few words per note**, centred ~0.06 above or below the component it comments on — notes
  are drawn centred on their coordinates, component labels to the right of the circle. One colour
  per intent; detail goes in the written assessment.
- **No coordinates in note text.** Any `[n, n]` in a note becomes its position — write "move to
  ~0.8", never "move to [0.6, 0.8]".

## Reference files (read on demand)

| File                                | Read when                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `reference/creating-maps.md`        | Creating a map: workflow, validation checklist, commentary template, worked examples |
| `reference/review-playbook.md`      | Reviewing a map: every check, note placement and wording, a worked review            |
| `reference/evolution-assessment.md` | Placing or questioning any component on the evolution axis                           |
| `reference/concepts.md`             | Explaining the method; climatic patterns, strategy cycle, PST, gameplay              |
| `reference/doctrine.md`             | Doctrine checks in a review; explaining doctrine                                     |
| `reference/ai-era-patterns.md`      | Maps with software or AI components; build-vs-buy for software                       |
| `examples/*.wmap`                   | Tea shop, SaaS platform, AI coding agent — complete maps to start from               |
| The **`owm-dsl` skill**             | Every time you read or write a `.wmap`/`.owm` file                                   |

Read only what the current step needs.

> Sources: the method content (evolution, climatic patterns, doctrine, gameplay, PST) follows Simon
> Wardley's _Wardley Maps_, shared under CC BY-SA 4.0. Workflow, evolution assessment, AI-era
> patterns and the examples are adapted from haberlah/wardley-mapping (MIT). See `THIRD-PARTY.md`
> at the plugin root.
