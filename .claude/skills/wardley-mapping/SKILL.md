---
name: wardley-mapping
description: >-
  Wardley Mapping expert. Explains Wardley Maps and the Online-Wardley-Maps (OWM) text DSL, teaches
  Doctrine (universal principles) and leadership/gameplay (context-specific plays), and reviews a
  user's map — what is good, what is weak, and where the potential is — adding colour-coded feedback
  notes directly to the .wmap/.owm file. Use whenever the user asks to review, critique, improve,
  or sanity-check a Wardley map; to explain Wardley-mapping concepts (evolution, doctrine, climatic
  patterns, pioneers/settlers/town planners, the strategy cycle); or to read/write .wmap / .owm files.
---

# Wardley Mapping

A Wardley Map is a **picture of a landscape**: user needs at the top, the chain of capabilities they
depend on beneath, each component placed by **how evolved** it is (left = novel, right = commodity).
Unlike most "strategy" diagrams it is **situational and movable** — you can reason about how things
will change and what to do about it. This skill lets you (1) explain mapping, (2) read/write the OWM
text DSL these files use, and (3) review a real map and return actionable, colour-coded feedback.

## The two axes (always check these first)

- **Y — value chain / visibility.** Top = visible to the user; bottom = invisible plumbing. A
  component sits **above** the things it needs. The map is **anchored** by a user (`anchor`) and a
  need at the very top. No anchor / no user need = the map is not really a map yet.
- **X — evolution.** Left → right, driven by supply **and** demand competition:
  **Genesis → Custom-Built → Product (+rental) → Commodity (+utility)**. Things only move **right**
  over time, never left. In this codebase the stage boundaries on the 0..1 maturity axis are
  `0.17 / 0.40 / 0.70` (Genesis `0–0.17`, Custom `0.17–0.40`, Product `0.40–0.70`, Commodity `0.70–1.0`).

Coordinates in the DSL are `[visibility, maturity]`, both `0..1`: **visibility** `1` = top, `0` =
bottom; **maturity** `0` = genesis (left), `1` = commodity (right).

## How to review a map (the core job)

1. **Read the file** and build a mental model: anchor(s)/users, components, dependency links,
   each component's position, any `evolve` movements, pipelines, and decorators (build/buy/outsource,
   market/ecosystem, inertia). If given DSL, parse it; if given an image, ask for the `.wmap`/DSL.
2. **Check the structure** (see `reference/review-playbook.md`): is there a real user + need at the
   top? Is the value chain ordered correctly (visible on top, dependencies pointing down)? Is each
   component's **evolution stage realistic** (a common mistake is putting commodities like compute,
   power or payments too far left)? Are dependencies complete down to commodities, and free of
   obvious cycles or missing links?
3. **Apply Climatic patterns** (`reference/concepts.md`): which components _will_ evolve right, where
   is **inertia** likely, where does commoditisation **enable new genesis** (platform effects),
   where do practices need to **co-evolve**.
4. **Apply Doctrine** (`reference/doctrine.md`): score the map/organisation against the universal
   principles — focus on user needs, high situational awareness, _use appropriate methods per
   evolution stage_, manage inertia, use a common language, think small, etc.
5. **Spot leadership / gameplay** (`reference/concepts.md`): concrete plays the map suggests —
   commoditise/shift-to-utility, build-vs-buy-vs-outsource by stage, exploit an ecosystem (ILC),
   accelerate/decelerate evolution, restructure teams as pioneers/settlers/town planners.
6. **Deliver feedback two ways:**
   - A short written assessment: **Strengths**, **Weaknesses / risks**, **Potential / plays**.
   - **Colour-coded notes added to the DSL**, placed next to the component they comment on, so the
     user sees the feedback on the canvas. Keep each note to a few words.

## Colour convention for feedback notes

This editor supports a per-note colour (project extension, see `reference/owm-dsl.md`). Use it to
make the review legible at a glance:

| Colour    | Hex       | Meaning                                        |
| --------- | --------- | ---------------------------------------------- |
| 🟢 Green  | `#15803d` | Good — well placed / a genuine strength        |
| 🟠 Amber  | `#b45309` | Watch — caution, inertia risk, needs attention |
| 🔴 Red    | `#b91c1c` | Problem — misplaced, risky, or missing         |
| 🔵 Blue   | `#1d4ed8` | Info / neutral observation                     |
| 🟣 Purple | `#7e22ce` | Idea / opportunity / suggested play            |

Syntax: `note <short feedback> [visibility, maturity] (color #hex)`. Position the note **near** the
component (offset slightly so it doesn't overlap the node or its label). Example — appending a review
to a map:

```
note Genuine differentiator — keep in-house [0.46, 0.33] (color #15803d)
note Compute is a commodity; shift to utility/cloud [0.16, 0.46] (color #b91c1c)
note Inertia likely here (sunk cost) [0.30, 0.66] (color #b45309)
note Platform play: expose this as an API [0.55, 0.62] (color #7e22ce)
```

When you change a map, **preserve everything else** (round-trip the DSL) and only add/adjust the
feedback notes unless the user asks you to move components. Prefer adding notes over silently moving
the user's components — suggest moves in notes/text and let them decide.

## Reference files (read on demand)

- `reference/concepts.md` — evolution stages & how characteristics change, climatic patterns, the
  strategy (OODA) cycle, pioneers/settlers/town planners, gameplay catalogue.
- `reference/doctrine.md` — Simon Wardley's Doctrine, the universal principles, grouped by phase.
- `reference/owm-dsl.md` — the full OWM text DSL this project reads/writes, incl. the `(color …)`
  note extension and a worked example.

## Authoring new maps

When asked to _create_ a map: start from the **user and their need** (anchor at top), add the chain
of components downward, link dependencies, then place each on the evolution axis honestly (don't
flatter novel work as commodity or vice-versa). Add `evolve` arrows for expected movement. Keep it
small and legible. Then run the review steps above on your own map before presenting it.

> Sources & licence: the conceptual content (Doctrine, climatic patterns, gameplay, PST) is Simon
> Wardley's _Wardley Maps_ work, shared under CC BY-SA. See the reference files for details.
