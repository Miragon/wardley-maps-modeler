# Wardley Mapping — concepts reference

## Evolution: the four stages and how characteristics change

Everything evolves left→right through competition (supply **and** demand). The four stages and the
way a component's _characteristics_ change as it moves:

|                  | I Genesis                   | II Custom-Built   | III Product (+rental)            | IV Commodity (+utility)        |
| ---------------- | --------------------------- | ----------------- | -------------------------------- | ------------------------------ |
| Ubiquity         | rare                        | uncommon          | common                           | ubiquitous                     |
| Certainty        | poorly understood           | rapidly improving | well understood                  | known / accepted               |
| Market           | undefined                   | forming           | growing                          | mature / stable                |
| Knowledge        | uncertain                   | learning          | documented                       | standardised                   |
| Value focus      | differential / future worth | finding use       | profit / feature differentiation | volume / cost / utility        |
| Failure          | expected, tolerated         | moderate          | not tolerated well               | operational / assumed reliable |
| Method that fits | **agile / experiment**      | iterate           | **lean**                         | **six-sigma / standardise**    |
| Mindset          | gamble, explore             | refine            | optimise                         | industrialise                  |

Maturity coordinates (this codebase): Genesis `0–0.17`, Custom `0.17–0.40`, Product `0.40–0.70`,
Commodity `0.70–1.0`.

**Common placement mistakes to flag in a review**

- Treating a commodity (compute, storage, power, payments, email, auth) as if it were custom/genesis
  → wasted effort building what you should rent/buy.
- Treating a genuine differentiator as a commodity → outsourcing your edge.
- A value chain that stops halfway and never reaches the commodities it really rests on.
- Components with no path to a user need (orphans), or links pointing "uphill".

## Climatic patterns (forces you don't control — anticipate them)

- **Everything evolves** through supply & demand competition.
- **Characteristics change** as things evolve (see table) — so the _same_ component needs different
  methods/teams at different stages.
- **No single method fits all** — agile in genesis, lean in product, six-sigma in commodity.
- **Efficiency enables innovation** — commoditising a component (e.g. utility compute) frees energy
  and capital for new, higher-order things built on top.
- **Higher-order systems create new sources of worth** — commoditised electricity → appliances;
  utility compute → big data / ML. Look for the next layer up.
- **Co-evolution of practice** — new practices co-evolve with evolving activities (e.g. DevOps with
  utility computing). Practices can lag and create friction.
- **Past success breeds inertia** — prior investment, contracts, ego and business models resist the
  very change the map predicts. Inertia usually sits on valuable, established components.
- **Capital (and competition) flows to new areas of value** — once something commoditises, attention
  moves to what it enables.
- **Commoditisation can be accelerated or slowed** by players (open source, standards, regulation,
  FUD, patents).

## The strategy cycle (why mapping is iterative)

Mapping feeds an **OODA-style loop**: **Purpose → Landscape (map) → Climate (patterns) → Doctrine
(universal principles) → Leadership (context-specific plays) → act → observe again.** It is a cycle,
not a one-off plan: you map, act, and re-map as the landscape moves.

## Aptitude & attitude — Pioneers, Settlers, Town Planners (PST)

Different stages need different cultures. Staffing one team for all three fails.

- **Pioneers** — explore the genesis/uncharted; build crude, fast experiments; comfortable with
  failure and uncertainty.
- **Settlers** — turn the half-baked into a real, understood product; make it useful, find the
  customers, build the ecosystem; the bridge.
- **Town Planners** — industrialise into commodity/utility; ruthless about scale, cost, reliability,
  standards.

The **"theft"** mechanism: settlers steal from pioneers (productise their work), town planners steal
from settlers (commoditise it), which pushes pioneers to find the next new thing → constant evolution.
In a review, ask: _does the org structure match the evolution profile of its components?_

## Gameplay / leadership — context-specific plays (a catalogue to draw on)

Plays only make sense **given a specific map**. Common ones to suggest where the map warrants it:

- **User-/need-driven**: refocus on an underserved user need; remove components that serve no need.
- **Accelerators**: open source, open data, open APIs, network effects → speed a component's
  evolution (often a component you depend on, to commoditise it).
- **De-accelerators / barriers**: patents, exclusive deals, standards control → slow a competitor or
  protect a position (use with care).
- **Ecosystem (ILC — Innovate-Leverage-Commoditise)**: provide a utility, sense what others build on
  it, then commoditise the successful patterns. A powerful platform play.
- **Build vs buy vs outsource by stage**: build in genesis (differentiator), buy products in stage
  III, use utilities/outsource in commodity. Mismatches are a classic finding.
- **Tower & moat / two-factor markets / sensing engines** for platforms.
- **Manage inertia**: name it explicitly, plan the transition, expect resistance on valuable
  established components.
- **Pipeline**: manage a set of related components evolving across stages (the `pipeline` element).
- **Exploiting co-evolution**: adopt the co-evolving practice early (e.g. new operating model).

When recommending a play, tie it to the **specific component and its stage** on the map, and capture
it as a purple "idea" note.
