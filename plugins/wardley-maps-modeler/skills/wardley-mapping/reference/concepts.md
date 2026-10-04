# Wardley Mapping — Concepts

Wardley Mapping was created by **Simon Wardley** (_Wardley Maps_, https://wardleymaps.com). It is a
way of making a business or technology landscape visible so that strategy can be discussed in terms
of _position_ and _movement_ rather than lists, slogans or SWOT grids. A map is only useful in a
context: it answers a question about one user, one scope, one moment — and gets redrawn as the
landscape moves.

## What makes a map a map

Wardley's test: a map has an **anchor** (the user), **position** (components relative to each
other) and **movement** (where they are heading). A diagram with boxes and arrows but no meaningful
x position is not a map.

| Element                                 | Meaning                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Anchor / user**                       | Whoever the map serves: customer, citizen, regulator, staff. Top of the map.                             |
| **User need**                           | What the anchor wants, in their words ("Cup of Tea", not "Beverage Service"). Directly below the anchor. |
| **Component**                           | A capability, activity, practice, data set or piece of knowledge the chain depends on.                   |
| **Dependency link**                     | "A needs B". A is drawn above B: visibility decreases down the chain.                                    |
| **Evolution position**                  | Where the component sits between Genesis and Commodity — evidence-based, not wishful.                    |
| **Movement (`evolve`)**                 | Where the component is expected to move. Always rightward.                                               |
| **Inertia**                             | Resistance to that movement — sunk cost, contracts, skills, business model, ego.                         |
| **Pipeline**                            | One component available in several forms at different stages (e.g. campfire kettle, electric kettle).    |
| **Build / buy / outsource**             | How a component is sourced. Should follow its stage.                                                     |
| **Market / ecosystem**                  | A component that is a market or ecosystem in itself (a platform others build on).                        |
| **Pioneers / settlers / town planners** | Regions showing which attitude (team culture) owns which part of the map.                                |
| **Accelerator / de-accelerator**        | A force speeding up or slowing down a component's evolution (open source, regulation, patents).          |
| **Submap**                              | A component expanded into its own map.                                                                   |

How each is written in the file is the `owm-dsl` skill's job.

## Evolution: four stages, changing characteristics

Everything evolves left → right through competition — supply **and** demand. Evolution is not
driven by time or by adoption: a component can sit in Genesis for decades without competition, or
cross to Commodity in a few years under intense competition. As it moves, its **characteristics**
change:

|                  | I Genesis                  | II Custom-Built    | III Product (+rental)           | IV Commodity (+utility)       |
| ---------------- | -------------------------- | ------------------ | ------------------------------- | ----------------------------- |
| Maturity (x)     | `0–0.17`                   | `0.17–0.40`        | `0.40–0.70`                     | `0.70–1.0`                    |
| Ubiquity         | rare                       | uncommon           | common                          | widespread, standardised      |
| Certainty        | poorly understood          | rapidly increasing | increasing use, well understood | known, accepted               |
| Market           | undefined                  | forming, emerging  | growing, competing vendors      | mature, stabilised            |
| Knowledge        | uncertain, tacit           | learning           | refined, documented             | codified, standard procedures |
| Publications     | describe the wonder        | how we built it    | how to operate and maintain it  | how to use it                 |
| Value focus      | future worth, differential | seeking profit     | high profitability, features    | high volume, low margin       |
| Failure          | high, tolerated, expected  | moderate           | not tolerated                   | operational; must not happen  |
| Method that fits | **agile, experiment**      | agile → lean       | **lean**                        | **six sigma, standardise**    |
| Mindset          | explore, gamble            | learn, refine      | optimise, differentiate         | industrialise, scale          |

The modeler's boundaries `0.17 / 0.40 / 0.70` are an operational convention for consistent
placement; Wardley's own method is qualitative. `evolution-assessment.md` has the full scoring
procedure, signals per stage, and the evolution labels for practices, data and knowledge.

## Climatic patterns — the forces you do not control

Climatic patterns describe how the landscape changes whatever anyone does. Use them to explain why
components will move and to anticipate the next state of the map. Grouped as in Wardley's
catalogue:

**Components**

- **Everything evolves** through supply and demand competition.
- **Characteristics change** as components evolve (table above) — the same component needs
  different methods, teams and contracts at different stages.
- **No choice over evolution (Red Queen).** If competitors adopt the more evolved form, you must
  follow or fall behind.
- **No one size fits all.** Agile, lean and six sigma each fit one part of the map; applying one
  method everywhere is a guaranteed mismatch somewhere.
- **Components can co-evolve.** New practices emerge around a newly commoditised activity (DevOps
  with utility compute). Old practices applied to the new activity create friction.
- **Commoditisation ≠ centralisation.** A component can become a commodity and still be supplied by
  many providers.

**Financial**

- **Higher-order systems create new sources of worth.** Utility electricity enabled appliances;
  utility compute enabled big data and machine learning. Look for what the next commodity enables.
- **Efficiency does not mean reduced spend.** Cheaper components get used far more (Jevons
  paradox); total spend often rises.
- **Capital flows to new areas of value** once something commoditises.
- **Creative destruction.** The new utility destroys the value chains built on the old product.
- **Future value is inversely proportional to certainty.** The most uncertain (leftmost) components
  carry both the highest risk and the highest potential.

**Speed**

- **Efficiency enables innovation.** Commoditising a component frees capital and attention and
  lets new things be built on top of it, faster.
- **Evolution of communication mechanisms** (printing, internet, APIs, open source) speeds up
  evolution overall.
- **Change is not always linear.** Discontinuities happen.
- **Shifts from product to utility show a punctuated equilibrium**: a long, stable product phase,
  then a rapid shift.

**Inertia**

- **Success breeds inertia.** Past investment, contracts, skills, culture and business model resist
  the very change the map predicts. Inertia sits on valuable, established components.
- **Inertia increases the more successful the past model is.**
- **Inertia can kill an organisation** that clings to a component its market has already evolved
  past.

**Competitors**

- **Competitors' actions will change the game.** Every position is temporary.
- **Most competitors have poor situational awareness** — an advantage for anyone who maps.

**Prediction**

- **Not everything is random.** _What_ will evolve is often predictable (anything under
  competition); _when_ is not. Weak signals help with timing.
- **Economies have cycles — peace, war, wonder.** Peace: incremental competition between product
  vendors. War: a component shifts to utility and the old value chains break. Wonder: new
  higher-order systems flourish on the new utility.
- **Two kinds of disruption.** Product-to-product substitution (a better product appears) is hard
  to predict. Product-to-utility substitution is predictable in _what_, uncertain in _when_ — and is
  the one that hurts incumbents most, because their inertia is highest exactly there.
- **You cannot measure evolution over time or adoption.** Use characteristics and market evidence
  instead.
- **The less evolved something is, the more uncertain it is.** Plans for Genesis components are
  hypotheses.

## The strategy cycle — why mapping is iterative

**Purpose → Landscape → Climate → Doctrine → Leadership → act → observe again.**

- **Purpose** — why are we doing this (the strategic question).
- **Landscape** — the map: user, needs, value chain, evolution.
- **Climate** — the patterns above: how the landscape will change.
- **Doctrine** — universal principles that apply whatever the landscape (`doctrine.md`).
- **Leadership** — context-specific choices: the gameplay below.

The cycle repeats: act, observe the result, redraw. A map is a snapshot, not a plan.

## Pioneers, Settlers, Town Planners (PST)

Different stages need different attitudes. One team culture for the whole map fails somewhere.

- **Pioneers** work in Genesis: explore the uncharted, build crude experiments fast, are comfortable
  with failure. They show you wonder — and are often wrong.
- **Settlers** work across Custom-Built and early Product: turn a half-working idea into something
  useful and understood, find the customers, build the product. They make it real.
- **Town Planners** work across late Product and Commodity: industrialise, standardise, drive cost
  down and reliability up, build the utility others build on.

The **theft** mechanism keeps the system moving: settlers take from pioneers and productise, town
planners take from settlers and commoditise, and the new utility gives pioneers a platform for the
next genesis. In a review, ask: does the organisation's team structure match the evolution profile
of its components? Pioneers running a commodity, or town planners asked to invent, are classic
findings.

## Gameplay — context-specific plays

Gameplay only makes sense **given a specific map**: tie every play you recommend to a named
component and its stage, and capture it as a purple idea note. Wardley catalogues around sixty
plays in eleven groups; the ones most often relevant:

| Group                     | Plays                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **User perception**       | Education, bundling, creating artificial needs (use with care), confusion of choice, brand and marketing.                                                          |
| **Accelerators**          | Open source, open data, open APIs, exploiting network effects, co-operation, standards — push a component (often one you depend on) towards commodity.             |
| **De-accelerators**       | Exploiting constraints, intellectual property, creating barriers — slow a component's evolution to protect a position.                                             |
| **Dealing with toxicity** | Disposal of liability, sweat and dump, refactoring — get rid of a component that has become a burden.                                                              |
| **Market**                | Differentiation, pricing policy, harvesting, standards game, last man standing, buyer/supplier power.                                                              |
| **Defensive**             | Threat acquisition, raising barriers to entry, managing inertia, defensive regulation.                                                                             |
| **Attacking**             | Directed investment, experimentation, centre of gravity, undermining barriers to entry, fool's mate (commoditise a hidden dependency of a competitor).             |
| **Ecosystem**             | ILC (innovate–leverage–commoditise), sensing engines, tower and moat, two-factor / N-sided markets, alliances, co-creation, embrace and extend, channel conflicts. |
| **Competitor**            | Ambush, fragmentation play, reinforcing a competitor's inertia, sapping, restriction of movement, talent raid.                                                     |
| **Positional**            | Land grab, first mover, fast follower, weak signal / horizon scanning.                                                                                             |
| **Poison**                | Licensing, insertion, designed to fail.                                                                                                                            |

Some plays (signal distortion, misdirection, designed to fail, poison plays in general) are
manipulative or harmful. Name them when explaining or when the user needs to recognise one used
against them; do not recommend them.

The plays you will recommend most often:

- **Build / buy / outsource by stage.** Build in Genesis and where you differentiate, buy products
  in Product, consume utilities in Commodity. A mismatch is the most common review finding.
- **ILC.** Provide a component as a utility, watch what the ecosystem builds on it (a sensing
  engine), commoditise the successful patterns into the platform.
- **Open up to accelerate.** Open-source or standardise a component you depend on but do not
  differentiate on, so it commoditises and its cost falls — especially if a competitor makes money
  from it.
- **Exploit inertia.** Where a competitor has inertia on a component that is about to shift to
  utility, accelerate the shift.
- **Tower and moat.** Dominate a commodity component many others depend on, then build higher-order
  value on it.
- **Manage your own inertia.** Name it, plan the transition, expect resistance where the past was
  most profitable.

## Common smells in a map

- No anchor, or an anchor connected straight to infrastructure with no user need in between.
- Components with no path to any user need (orphans), or dependencies pointing uphill.
- A value chain that stops halfway and never reaches the commodities it rests on.
- Commodities drawn as Genesis or Custom-Built — effort spent building what should be rented.
- Differentiators drawn as Commodity — the edge about to be outsourced.
- No movement anywhere: a map without `evolve` arrows or inertia says nothing about the future.
- One sourcing method or one team culture across all stages.
- The same capability drawn twice under two names (duplication the map should expose, not
  reproduce).

> Source: Simon Wardley, _Wardley Maps_ (https://wardleymaps.com), CC BY-SA 4.0. The summaries
> above are a faithful working reference in original prose; wording and grouping follow Wardley's
> published catalogues, which vary slightly between editions.
