# Review playbook

A review leaves the user with two things: **the same map plus colour-coded notes**, written into
the `.wmap`/`.owm` file, and **a short written assessment** in chat. The map is the user's — add
notes, never silently change their components, positions or links.

Real-world maps fail these checks more often than not. In a sample of about 150 published community
maps run through the modeler's parser, nearly nine in ten had no `anchor` line, more than half
contained links to names that do not exist, about one dependency in six pointed uphill, and two
thirds had no `evolve` arrow. Expect findings.

## 0. Get the file

Review the text, not a picture. If the user shares a screenshot, ask for the file; if there is
none, transcribe it into a `.wmap` and confirm the positions before judging them. Load the
`owm-dsl` skill — it explains every construct you will meet.

## 1. Parse and take inventory

If Node is available, run `check-map.mjs` from the `owm-dsl` skill (`reference/api.md`) on the
file. Diagnostics alone miss the silent defects, so collect all of these as findings:

- **The parse throws** — that is the first finding: the Modeler cannot open the file at all.
- **Every diagnostic.**
- **Every line reported as "not understood"** (a non-comment `rawPassthrough` entry) — it draws
  nothing; usually a misspelt keyword (`compnent`, `evolv`) or a link whose left name contains `;`.
- **A changed title** — compare the parsed `map.config.title` with the file's `title` line; a link
  like `Title Search -> Index` silently replaces it.

Without Node, read the file against the `owm-dsl` skill's "Before handing a file back" checklist.
Then list:

- anchors (users) and the needs directly below them
- components with their `[visibility, maturity]` and derived stage (`0.17 / 0.40 / 0.70`)
- dependency links (`A -> B`: A needs B) and flow links (`+>`)
- `evolve` arrows, `inertia`, `(build)`/`(buy)`/`(outsource)`, `(market)`/`(ecosystem)`
- pipelines, PST regions (`pioneers`, `settlers`, `townplanners`), accelerators, submaps
- existing notes and annotations — do not duplicate what is already said

## 2. Structural checks

| Check                         | How to detect                                                                                                                                                             | Why it matters                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Anchor present**            | No `anchor` line; or the top element is a component called "User"/"Customer".                                                                                             | Without a user there is no need, and without a need no value chain.           |
| **Need below the anchor**     | The anchor links straight to infrastructure ("Customer -> Database").                                                                                                     | The need is the point of the map; skipping it hides why anything exists.      |
| **Links point down**          | A dependency `A -> B` where B has a **higher** visibility than A.                                                                                                         | Either the link is reversed or a component sits at the wrong height.          |
| **Dangling links**            | Diagnostic `Link: "X" not found` — typo, case mismatch, renamed component, `;` in the right-hand name. A `;` in the left-hand name drops the link without any diagnostic. | The link **silently does not exist** on the canvas; the user thinks it does.  |
| **Silent lines**              | Lines reported as "not understood" (non-comment `rawPassthrough`); a parsed title that differs from the `title` line.                                                     | The user thinks these elements or links are on the map; they are not.         |
| **Dangling evolve**           | Diagnostic `evolve: component "X" not found`.                                                                                                                             | The movement arrow is not drawn.                                              |
| **Orphans**                   | A component in no link at all (pipeline children excepted).                                                                                                               | It serves no need — remove it or connect it.                                  |
| **Cycles**                    | `A -> B -> … -> A`.                                                                                                                                                       | A value chain is acyclic; a cycle usually hides a flow drawn as a dependency. |
| **Chain reaches commodities** | Leaves (components nothing below them) still in Genesis or Custom-Built.                                                                                                  | The map stops before the things that will move fastest and cost least.        |
| **Pipelines**                 | No block children (a range but no forms); the pipeline's component right above a child; an `evolve` that only restates the range.                                         | A pipeline is one component in several forms — suggest the forms as children. |
| **Readability**               | More than ~25 components; same column under `0.06` visibility apart; same row under `(7n + 40) / 1080` maturity apart (n = characters of the left name).                  | Overlapping circles and labels; too much to discuss. Suggest submaps.         |

Other diagnostics and what causes them:

- `Coordinate … is outside [0,1] and was clamped` — usually percentages (`[80, 30]`) or pixel
  values instead of fractions. Swapped `[maturity, visibility]` pairs inside `0..1` raise **no**
  diagnostic: find them by reading — a user need low on the map, a commodity at the top, links
  pointing uphill.
- `Line could not be interpreted (kept losslessly in rawPassthrough)` — syntax the modeler does not
  know, e.g. the legacy pixel form `pioneers [0.9, 0.1] 120 30`. The line survives but draws
  nothing.
- A file that **fails to load at all** with `Edge … references no element` — a linked `pipeline`
  with neither a `[start, end]` range nor a same-named component.

Duplicate names do not produce a diagnostic: links bind to the first declaration and the modeler
renames the second to "Name 2" on its next save. Flag them.

## 3. Evolution checks

Apply `evolution-assessment.md` to every component whose placement looks doubtful. The usual
suspects, as of 2026:

| Component                                 | Often drawn at          | Usually belongs                               |
| ----------------------------------------- | ----------------------- | --------------------------------------------- |
| Compute, storage, networking (cloud)      | Custom-Built `0.2–0.4`  | Commodity `0.8–0.95`                          |
| Power, water, internet connectivity       | anywhere left of `0.7`  | Commodity `0.85+`                             |
| Payment processing                        | Custom-Built            | Commodity `0.75–0.85`                         |
| Email and SMS delivery                    | Custom-Built or Product | Commodity `0.75–0.85`                         |
| Identity, authentication                  | Custom-Built            | late Product to Commodity `0.65–0.8`          |
| CRM, ERP, HR, warehouse management        | Custom-Built            | Product `0.5–0.65`                            |
| Managed relational database               | early Product           | late Product to Commodity `0.65–0.8`          |
| Source control, CI/CD                     | Custom-Built            | Product to Commodity `0.6–0.8`                |
| Foundation-model inference via API        | Genesis                 | Product `0.55–0.7` (see `ai-era-patterns.md`) |
| The organisation's actual differentiator  | Product or Commodity    | Genesis or Custom-Built                       |
| A new internal tool for a well-known need | Genesis ("new to us")   | Wherever the market is — often Product        |

Ranges are hedged: check the market evidence for the user's context before writing a red note. A
deliberate exception (a bank building its own payment rails) deserves an amber question, not a red
verdict.

## 4. Movement checks

- **Missing `evolve`.** Components with visible pressure — commodity alternatives exist, a market is
  forming — but no arrow. A map without movement says nothing about the future.
- **`evolve` pointing left** (target below the current maturity). Components never move left; this
  is either a typo or a new, different component.
- **Inertia.** Is it marked where it really is (established, profitable, contract-bound, skills-
  bound components), and is it named? Inertia on a Genesis component is suspicious — there is
  nothing established yet to defend. Inertia on a component with no `evolve` arrow raises the
  question: inertia against what?

## 5. Doctrine and method checks

- **Methods per stage.** `(build)` on Product or Commodity, `(outsource)` on a Genesis
  differentiator, or one delivery method across the whole map (`doctrine.md`: use appropriate
  methods).
- **Duplication.** The same capability twice under different names ("Payments" and "Payment
  Service"), or one component per team where one shared one would do.
- **PST.** If the map has `pioneers`/`settlers`/`townplanners` regions: do they cover the stages
  they should? Pioneers around Commodity components, or town planners in Genesis, are findings. If
  the map has none and the question is organisational, suggest them.
- **Practices.** A Commodity activity run with Genesis-stage practices, or a new practice the
  organisation has not adopted (co-evolution).

## 6. Climate and gameplay

With the structure sound, look forward (`concepts.md`):

- Which components will move right in the map's horizon, and what will that enable above them?
- Where will inertia — the user's or a competitor's — slow that down?
- Which one to three plays fit: build/buy/outsource corrections, ILC, open-sourcing a non-
  differentiating dependency, exploiting a competitor's inertia, pioneer team on the
  differentiator? Tie each to a named component and its stage.

## 7. Write the notes

**Colour = intent.** Exactly the modeler's palette (table in `SKILL.md`): green `#0B7A55` good,
amber `#92610A` watch, red `#C92A2A` problem, blue `#2B50D4` info, purple `#6A3DB8` idea. Teal,
pink and slate are free or neutral.

**Wording.** A few words — under ~30 characters where you can: the finding, not the argument
("Payments is a commodity: buy", "Orphan: who needs it?"). The reasoning goes into the written
assessment.

- **Never put coordinates or `[…]` in note text** — write "move to ~0.8" or "evolve to 0.62". Any
  `[n, n]` in a note becomes its position, without a diagnostic.
- **Write `(color #hex)`, American spelling.** `(colour …)` is not recognised: it silently becomes
  part of the note text and the note stays uncoloured.

**Placement.** The modeler draws a note **centred** on its coordinates, about `0.007` maturity
wide per character plus `0.015` (a 25-character note is ≈ `0.19` wide, ±0.095 around its centre)
and at least `0.05` visibility tall. Component circles have a radius of about `0.022` visibility,
and component labels run to the **right** of the circle; an anchor's label sits above its icon.

- Centre the note ~**0.06** above or below the component, at about the same maturity — or at the
  same height to its **left**, ending just before the circle.
- Keep the whole note inside `0..1`: its centre at least half its width from either edge.
- Do not cover another component, label or note. Crossing a link line is acceptable when the map is
  dense.
- Do not place a note inside a pipeline box (from the pipeline's height down to about `0.08` below
  it, child labels included) or over a team region's top-left corner, where its name sits.
- When a note cannot sit right next to its component, **name the component in the note**
  ("Uphill link from Warehouse").
- A note about something missing (a need, a link) goes where the missing thing would be.

**Quantity.** Five to ten notes for a typical map, at least one green. Twenty notes is a rewrite,
not a review — summarise instead.

**Where in the file.** Add the notes as one block after the user's element lines, before the
`evolve` lines and links — or simply append them at the end of the file. Either way the user's own
lines stay byte-identical. Never reorder, reformat or re-round them. A later graphical edit in the
Modeler regroups all lines by kind (team regions, pipelines, notes, components, anchors) whatever
you do; see the `owm-dsl` skill, "Editing an existing map".

**Earlier review notes.** Do not stack a second note on a finding that already has one. If notes
from an earlier review are now outdated, say so in the assessment and offer to remove them — do not
delete notes unasked.

## 8. Write the assessment

In chat, short and specific — every bullet names a component:

```markdown
**Strengths** — 2–4 bullets: what is well placed, well anchored, well sourced.

**Weaknesses & risks** — 2–5 bullets: misplacements, broken or uphill links, orphans, missing
movement, inertia, method mismatches. Mention parser diagnostics here.

**Potential & plays** — 1–3 plays tied to components and stages.

**Suggested moves** (not applied) — e.g. "Payments → ~0.8 and `(buy)`", "`evolve Warehouse System
0.55`". Offer to apply them.
```

## Worked review

The user's map of an online bookshop, with the nine `note` lines a review adds — everything else is
exactly the user's text:

```owm
title Online Bookshop
anchor Reader [0.95, 0.55]
component Book Discovery [0.85, 0.35]
component Checkout [0.82, 0.62]
component Curated Book Clubs [0.7, 0.12] (build)
component Recommendations [0.66, 0.3] (build)
component Catalogue [0.58, 0.55]
component Payments [0.5, 0.24] (build)
component Warehouse System [0.38, 0.36] inertia
component Email [0.3, 0.78]
component Delivery [0.2, 0.84] (outsource)
component Compute [0.08, 0.3] (build)
note Clear user, two needs [0.95, 0.66] (color #0B7A55)
note Differentiator: build it [0.65, 0.1] (color #0B7A55)
note Products exist: buy? [0.6, 0.25] (color #92610A)
note Uphill link from Warehouse [0.51, 0.61] (color #92610A)
note Payments is a commodity: buy [0.5, 0.11] (color #C92A2A)
note Orphan: who needs it? [0.36, 0.78] (color #92610A)
note Evolve to a WMS product [0.31, 0.37] (color #6A3DB8)
note Outsourced commodity: fits [0.14, 0.84] (color #0B7A55)
note Compute is a utility: rent [0.08, 0.18] (color #C92A2A)
evolve Curated Book Clubs 0.3
Reader -> Book Discovery
Reader -> Checkout
Book Discovery -> Curated Book Clubs
Book Discovery -> Recommendations
Book Discovery -> Catalogue
Checkout -> Payments
Checkout -> Warehouse System
Curated Book Clubs -> Catalogue
Recommendations -> Catalogue
Warehouse System -> Catalogue
Warehouse System -> Delivery
Payments -> Compute
```

And the assessment in chat:

> **Strengths**
>
> - Clear user (Reader) with two needs, Book Discovery and Checkout, directly beneath.
> - Curated Book Clubs is recognised as the differentiator: Genesis, built in-house, with an
>   `evolve` arrow.
> - Delivery is a commodity and outsourced — sourcing matches the stage.
>
> **Weaknesses & risks**
>
> - Payments (0.24, `(build)`) and Compute (0.3, `(build)`) are commodities drawn as Custom-Built:
>   engineering effort where nothing is gained, and a compliance burden on Payments.
> - Warehouse System → Catalogue points uphill: either the link is reversed or Catalogue belongs
>   lower in the chain.
> - Email is linked to nothing — which need does it serve?
> - Warehouse System carries inertia but no `evolve` arrow, while warehouse-management products
>   exist; the inertia is real but unplanned.
> - Recommendations (0.3, `(build)`): recommendation engines are sold as products — build only if
>   recommendations are part of the curation edge.
>
> **Potential & plays**
>
> - Buy Payments, rent Compute, and move that budget to a small pioneer team on Curated Book Clubs.
> - Plan the Warehouse System migration explicitly: name the inertia (contract? skills?) and set a
>   date.
>
> **Suggested moves** (not applied): Payments → ~0.8 with `(buy)`; Compute → ~0.9 with
> `(outsource)`; `evolve Warehouse System 0.55`; link `Curated Book Clubs -> Email` or remove Email.
> Shall I apply them?
