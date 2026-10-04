# Creating a map

Every map tells a story about where value comes from, how its components evolve, and where to put
strategic effort. Creating one produces **two deliverables**:

1. **The `.wmap` file**, written directly. The Wardley Maps Modeler (VS Code extension, Miragon AI
   Design, web app) renders it — never render it yourself.
2. **A short strategic commentary** in chat (template below).

Load the `owm-dsl` skill before writing the file; it owns syntax, layout and validation.

## Step 1 — Establish the strategic context

Before placing a single component, settle:

- **Strategic question.** What decision does this map inform? "Should we build or buy
  authentication?" is a question; "map our architecture" is not.
- **User (anchor).** Who is at the top of the chain — customer, citizen, internal team? More than
  one user is fine when their needs differ (Business and Public in the tea shop).
- **Needs.** The user's 1–4 most important needs, in their words.
- **Scope.** One product, one business unit, one journey. Big scopes become several maps.

If any of these is missing, ask. Do not invent the strategic question — the map's value comes from
the user's domain knowledge. If the user wants a draft anyway, state your assumptions at the top of
the commentary.

If the user hands you an existing file, read it first and continue from step 3 — or switch to the
review playbook if they want feedback rather than a new map.

## Step 2 — Build the value chain

Work **backwards** from each need to the capabilities it depends on, down to the infrastructure.

- **8–15 components.** Fewer than 6 rarely produces insight; more than about 18 becomes unreadable.
  For a large scope, propose a main map plus submaps (one component on the main map stands for a
  whole submap).
- **Every component is linked**, and the chain runs from the anchor down to things you buy or rent.
  A chain that stops at a Custom-Built component usually stopped too early.
- **Noun names:** "Payment Processing", not "Process Payments". One capability per component —
  "Auth & Billing" hides two different stages.
- **Unique, short names** (2–3 words). Links refer to components **by exact name** (case and spaces
  matter), so spell a name identically everywhere.
- **Needs sit directly below the anchor** and the anchor links only to needs, never straight to
  infrastructure.

## Step 3 — Assess evolution (the critical step)

This is what separates a map from a pretty diagram. For **every** component, apply
`evolution-assessment.md`: score the characteristics, check the market evidence, pick a maturity
value inside the stage, and **write a one- or two-sentence rationale**. The rationale goes into the
commentary table; it is how the user can challenge your placement.

Stage boundaries: Genesis `0–0.17`, Custom-Built `0.17–0.40`, Product `0.40–0.70`, Commodity
`0.70–1.0`. For software and AI components, also read `ai-era-patterns.md`.

## Step 4 — Add movement and context

- **`evolve`** every component under visible evolution pressure, to the maturity you expect in the
  map's horizon (usually 12–24 months). Targets are always to the right.
- **`inertia`** only where resistance is real and nameable (a contract, a sunk investment, a
  business model). Inertia everywhere means nothing.
- **`(build)` / `(buy)` / `(outsource)`** when sourcing is part of the question. They should follow
  the stage: build left, buy in the middle, outsource or rent on the right — a deliberate exception
  deserves a sentence in the commentary.
- **`(market)` / `(ecosystem)`** for components that are a market or a platform others build on.
- **Pipelines** when one need is served by several forms at different stages. Read the `owm-dsl`
  skill first: give the pipeline a same-named component and a `[start, end]` range — a pipeline
  with neither a range nor block children is not drawn.
- **One to three notes** for the key insights, in the palette colours from `SKILL.md`. Comments
  (`//`) are not a substitute — the modeler moves them to the end of the file on save.

## Step 5 — Lay out the map

Coordinates are `[visibility, maturity]`. A default vertical banding:

| Band                        | Visibility  |
| --------------------------- | ----------- |
| Anchors (users)             | `0.92–0.97` |
| User needs                  | `0.78–0.88` |
| Capabilities                | `0.45–0.75` |
| Supporting services         | `0.20–0.45` |
| Infrastructure, commodities | `0.05–0.20` |

- Every component sits **lower** than everything that depends on it, so all links point down.
- Same column (similar maturity): at least `0.06` visibility apart, or the circles touch.
- Same row (similar visibility): at least `(7 × characters of the left name + 40) / 1080` maturity
  apart — about `0.1` for a 10-character name — or the label runs into the next circle.
- Never shift a component across a stage boundary to make room; move it up or down instead. The
  `owm-dsl` skill's layout reference has the exact geometry.

## Step 6 — Write the file

Name it after the subject in kebab case (`tea-shop.wmap`). Write the lines in canonical order —
the order `serializeDSL(parseDSL(text))` keeps — so a parse/serialize round-trip returns your file
unchanged:

1. `title`
2. anchors, then components from top to bottom, then notes
3. pipelines, each followed by its `{ … }` block if it has one
4. `evolve` lines, in the same order as their components
5. links, grouped by source from top to bottom

Write numbers without trailing zeros (`0.4`, not `0.40`) — the serializer normalises them anyway.
A graphical edit in the Modeler later regroups the element lines by kind (team regions,
pipelines, notes, components, anchors, …); expect that diff and do not restore the old order by
hand (`owm-dsl` skill, "Editing an existing map").

## Step 7 — Validate

An empty diagnostics list is necessary, not sufficient. The parser reports nearly every line it
drops or rewrites — a misspelt keyword (`Unknown statement "componnet"`), a dangling link, a
duplicate name, words after a note's coordinates — but swapped `[maturity, visibility]` pairs and a
link to the wrong (existing) component look fine to it.

**With Node available**, run `check-map.mjs` from the `owm-dsl` skill (`reference/api.md`, "As a
script") on the file. It must report no diagnostics and nothing as "not understood" (non-comment
`rawPassthrough`), and a second serialize pass must change nothing.

**Without Node**, run the `owm-dsl` skill's "Before handing a file back" checklist, which includes:

- [ ] Every keyword spelt exactly (`component`, `anchor`, `note`, `evolve`, `pipeline`, …).
- [ ] Every coordinate is `[visibility, maturity]`, both within `0..1`.
- [ ] Every link endpoint matches a declared anchor or component name exactly.
- [ ] Every `evolve` names a declared component, and its target is greater than its maturity.
- [ ] Every `pipeline` has a `[start, end]` range or block children.
- [ ] No duplicate names (the parser renames the second one to "Name 2"; links bind to the first).
- [ ] No `->`, `+>`, `;`, `//`, `/*` or `[n, n]` inside a name.
- [ ] Nothing after a note's or pipeline's coordinates except `(color …)` (on a pipeline also
      `(y …)` and a trailing `{`) — anything else, a misspelt `(colour …)` included, is dropped —
      and no `[n, n]` inside note text.

Then the method checks:

- [ ] At least one anchor at the top; needs directly beneath it.
- [ ] No orphans: every component is reachable from an anchor.
- [ ] Every link points down; no cycles.
- [ ] The lowest components are Product or Commodity — or the commentary says why not.
- [ ] 8–15 components, spaced as in Step 5 (same column `≥ 0.06` visibility, same row
      `≥ (7n + 40) / 1080` maturity).

## Step 8 — Review your own map

Run `review-playbook.md` against the map before presenting it. Fix what you find rather than
reporting it — a fresh map should not need red notes.

## Step 9 — Strategic commentary

Reply in chat with this structure. Keep it to about one screen; tables beat prose.

```markdown
**Map:** `<file>.wmap` — <what it shows in one line>

**Purpose.** <the strategic question this map answers>

**Evolution assessment**

| Component | Stage | Maturity | Rationale (evidence) |
| --------- | ----- | -------- | -------------------- |

**Key observations** — 3–5 insights from the map's shape: clusters of Genesis components, single
points of failure, components under evolution pressure, where the chain stops early.

**Doctrine check** — the 2–3 most relevant principles: user needs clear? duplication? methods
matched to stages? bias towards one stage?

**Build / buy / outsource**

| Component | Recommendation | Why |
| --------- | -------------- | --- |

**Evolution predictions (12–24 months)** — what moves right, what drives it, what inertia resists
it.

**Recommended actions** — 3–5, prioritised, each tied to a component and its position.

**Open questions** — 2–3 things the map raises that need the user's knowledge or more evidence.
```

## When things go wrong

- **Diagnostics after writing:** fix the line it names and validate again. Most are links to a
  misspelt name; a clamped coordinate usually means percentages instead of fractions. Swapped
  coordinates inside `0..1` raise no diagnostic — re-read every `[visibility, maturity]` pair.
- **Incomplete input:** ask for the missing context instead of guessing.
- **Ambiguous stage:** place by the majority of the characteristics and record the tension in the
  rationale.
- **Too many components:** split into a main map and submaps; each submap replaces one component.

## Worked examples

Three complete maps ship in `examples/`. Each parses with zero diagnostics and is already
canonical text (a parse/serialize round-trip returns it unchanged). Start from the closest one when
the user's domain is similar.

### Tea shop — `examples/tea-shop.wmap`

Simon Wardley's canonical example: a tea shop serving business and public customers.

```owm
title Tea Shop
anchor Business [0.95, 0.63]
anchor Public [0.95, 0.78]
component Cup of Tea [0.79, 0.61]
component Cup [0.73, 0.78]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.8]
component Water [0.38, 0.82]
component Kettle [0.43, 0.35] inertia
component Power [0.1, 0.72] (outsource)
note Hot water is obvious and well known [0.54, 0.63] (color #2B50D4)
note Standard power lets kettles evolve [0.25, 0.3] (color #6A3DB8)
evolve Kettle 0.62
evolve Power 0.89
Business -> Cup of Tea
Public -> Cup of Tea
Cup of Tea -> Cup
Cup of Tea -> Tea
Cup of Tea -> Hot Water
Hot Water -> Water
Hot Water -> Kettle
Kettle -> Power
```

| Component  | Stage        | Maturity | Rationale                                                             |
| ---------- | ------------ | -------- | --------------------------------------------------------------------- |
| Cup of Tea | Product      | 0.61     | Sold everywhere, well understood; shops compete on quality and price. |
| Cup        | Commodity    | 0.78     | Standardised, many suppliers, bought on price.                        |
| Tea        | Commodity    | 0.81     | Globally traded with standard grades.                                 |
| Hot Water  | Commodity    | 0.8      | Obvious and well known; nobody differentiates on it.                  |
| Water      | Commodity    | 0.82     | Utility supply.                                                       |
| Kettle     | Custom-Built | 0.35     | The shop's own heating set-up, while standard electric kettles exist. |
| Power      | Commodity    | 0.72     | Utility; moving further towards a fully standardised supply.          |

**Key observation:** the Kettle is the only Custom-Built component and carries inertia, although
product alternatives exist — a clear candidate to evolve to Product. **Action:** replace the
bespoke kettle with a product and spend the freed attention on the cup of tea itself. Standardised
power is what lets the kettle market evolve faster (purple note).

### SaaS analytics platform — `examples/saas-platform.wmap`

A mid-stage B2B SaaS company deciding where to focus engineering and what to buy.

- **ML Insights** (Genesis, 0.1, `(build)`) is the differentiator — a small pioneer team,
  experimentation, failure tolerated. Evolves towards 0.3 as the approach stabilises.
- **Analytics Engine** (Custom-Built, 0.28, `(build)`) is the core IP; keep building, but with
  settler practices (lean, user research), not pure experimentation.
- **Data Connectors** (Custom-Built, 0.32, `inertia`) are bespoke integrations while managed ELT
  products exist — the evolve arrow to 0.62 marks the expected switch, the amber note the
  resistance.
- **Subscription** is the customer's third need, in their words: a self-service plan. Billing
  hangs beneath it — the customer never needs "Billing" itself, so the anchor does not link to it.
- **Authentication, Billing, API Gateway, Data Warehouse, Monitoring** (`(buy)`) and **Cloud
  Compute** (`(outsource)`) are Product or Commodity: building any of them would be misallocated
  effort.

| Component       | Recommendation      | Why                                                      |
| --------------- | ------------------- | -------------------------------------------------------- |
| ML Insights     | Build               | No market alternative fits the domain; this is the edge. |
| Data Connectors | Transition to buy   | Managed connectors now cover the common sources.         |
| Authentication  | Buy                 | Commodity identity services; no differentiation.         |
| Billing         | Buy                 | Standardised subscription billing.                       |
| Cloud Compute   | Outsource (utility) | Not negotiable.                                          |

### AI coding agent — `examples/ai-startup.wmap`

A start-up building an autonomous coding agent. AI placements date quickly, so the title carries
the date (`AI Coding Agent — 2026-10`).

- **Value migrates up the chain.** The Foundation Model (Product, 0.64, evolving to 0.8) is
  commoditising; the differentiators are the **Context Engine** (0.2) and **Tool Orchestration**
  (0.24) above it — early Custom-Built, `(build)`, each with a short `evolve` arrow: frameworks
  exist, a settled practice does not (purple note).
- **Inertia paradox.** The **RAG Pipeline** (Custom-Built, 0.36) was built recently and already
  faces managed retrieval services; the team resists migrating (amber note, evolve to 0.55).
- **Shadow build.** The **Code Review Agent** was built by one engineer outside the normal process.
  AI code review is sold as a product, so it sits where the market is (Product, 0.54), not in
  Genesis — new to the team is not new to the market. It duplicates a buyable product and nobody
  owns it (amber note): buy one, or give it an owner before depending on it.
- **Billing** hangs under the Task Interface (usage is billed per task), not under the anchor: the
  developer needs the agent, not billing.
- **Products and commodities stay bought:** Vector Database (Product, 0.6), Git Integration,
  Identity, Billing (Commodity) and Cloud Compute (outsourced utility).

`ai-era-patterns.md` explains the patterns behind these placements and how to hedge them.

> Adapted from haberlah/wardley-mapping (MIT): workflow, validation checklist, commentary template
> and the three examples (re-placed on the modeler's stage boundaries). The tea shop is Simon
> Wardley's example (CC BY-SA 4.0).
