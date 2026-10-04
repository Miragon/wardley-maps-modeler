# Evolution assessment

The most common mistake in Wardley Mapping is placing components by gut feel. This reference turns
placement into a defensible assessment: score the component against the characteristics of each
stage, check the market evidence, pick a maturity value, and write down why.

Evolution is driven by **supply and demand competition**, not by time. A component can stay in
Genesis for decades if nobody competes on it, or race from Custom-Built to Commodity in a few years
when competition is intense.

## The stage boundaries

The x axis is the component's **maturity**, `0..1`. The Wardley Maps Modeler derives the stage from
it with these boundaries — use them consistently in every map, assessment and note:

| Stage                       | Maturity    | Early in the stage                    | Late in the stage                          |
| --------------------------- | ----------- | ------------------------------------- | ------------------------------------------ |
| **I Genesis**               | `0–0.17`    | `0.02–0.08` first working instance    | `0.10–0.16` a few copies, still unclear    |
| **II Custom-Built**         | `0.17–0.40` | `0.18–0.25` a few bespoke builds      | `0.30–0.39` patterns known, first vendors  |
| **III Product (+rental)**   | `0.40–0.70` | `0.42–0.50` competing products appear | `0.60–0.69` feature parity, price pressure |
| **IV Commodity (+utility)** | `0.70–1.0`  | `0.72–0.80` standardised, rentable    | `0.85–0.95` invisible utility              |

Avoid values right on a boundary (`0.17`, `0.4`, `0.7`): a component at exactly `0.7` reads as
Commodity to the modeler and as "late Product" to most humans. Pick a side and say why. Wardley's
own method is qualitative; these numbers are an operational convention so maps stay comparable.

## Characteristics per stage

### Stage I — Genesis (`0–0.17`)

Novel, uncertain, constantly changing.

| Dimension       | Characteristic                                       |
| --------------- | ---------------------------------------------------- |
| Ubiquity        | Rare — very few examples exist anywhere.             |
| Certainty       | Poorly understood; no agreed definition or approach. |
| Publications    | Describe the wonder of the thing ("we tried X").     |
| Market          | Undefined; no clear buyers or sellers.               |
| Knowledge       | Tacit, in a few people's heads.                      |
| User perception | Wonder, excitement, confusion.                       |
| Failure         | Expected and tolerated — experiments fail.           |
| Focus           | Exploration, research, invention.                    |
| Methods         | Agile experimentation, rapid prototyping.            |
| Cost            | High per unit; investment is a bet on future worth.  |

**Signals:** nobody else does it; the team cannot fully explain it yet; frequent pivots; "we're the
only ones".

**Examples (2026):** quantum error correction, brain-computer interfaces, experimental fusion
reactor designs.

### Stage II — Custom-Built (`0.17–0.40`)

Increasingly understood, still bespoke.

| Dimension       | Characteristic                                           |
| --------------- | -------------------------------------------------------- |
| Ubiquity        | Uncommon — several organisations have built their own.   |
| Certainty       | Rapidly increasing; patterns emerging.                   |
| Publications    | How we built it, how it works.                           |
| Market          | Forming; early buyers, consultancies, first vendors.     |
| Knowledge       | Being learned and written down.                          |
| User perception | Promising, "we're getting there", a source of advantage. |
| Failure         | Disappointing but tolerable.                             |
| Focus           | Learning, differentiation, competitive advantage.        |
| Methods         | Agile moving towards lean.                               |
| Cost            | High; specialist bespoke development.                    |

**Signals:** "we built our own"; several companies built similar things independently; no dominant
off-the-shelf option, but the need is recognised.

**Examples (2026):** in-house ML pipelines, proprietary trading algorithms, a domain-specific
pricing engine, agent orchestration in production.

### Stage III — Product (+rental) (`0.40–0.70`)

Well defined, with competing providers.

| Dimension       | Characteristic                                     |
| --------------- | -------------------------------------------------- |
| Ubiquity        | Common — many organisations use it.                |
| Certainty       | Well understood; clear requirements.               |
| Publications    | How to operate, maintain, install; certifications. |
| Market          | Growing and competitive; multiple vendors.         |
| Knowledge       | Explicit, documented, trainable.                   |
| User perception | Expected — "of course we have one".                |
| Failure         | Not tolerated; users expect it to work.            |
| Focus           | Feature competition, profit.                       |
| Methods         | Lean.                                              |
| Cost            | Moderate and falling.                              |

**Signals:** you can name three or more competing vendors; analysts compare them; buyers evaluate
feature lists; switching is possible but costly.

**Examples (2026):** CRM, ERP, CI/CD services, email-marketing platforms, foundation-model
inference.

### Stage IV — Commodity (+utility) (`0.70–1.0`)

Ubiquitous, standardised, invisible.

| Dimension       | Characteristic                                          |
| --------------- | ------------------------------------------------------- |
| Ubiquity        | Widespread to universal.                                |
| Certainty       | Fully understood and defined.                           |
| Publications    | How to use it; operations manuals; utility price lists. |
| Market          | Mature, stabilised; commodity or utility pricing.       |
| Knowledge       | Codified; standard operating procedures.                |
| User perception | Invisible, taken for granted — until it breaks.         |
| Failure         | Operational; an outage is news.                         |
| Focus           | Volume, cost, operational excellence.                   |
| Methods         | Six sigma, standardisation, ITIL-style operations.      |
| Cost            | Low, pay-per-use.                                       |

**Signals:** nobody thinks about it until it breaks; interfaces are standardised across providers;
pricing is transparent; switching costs are low.

**Examples (2026):** cloud compute, object storage, electricity, internet connectivity, DNS,
payment processing.

## Evolution types — what kind of thing is it?

Not everything on a map is an activity. Practices, data and knowledge evolve too, under different
names for the same four stages:

| Type                         | I          | II           | III        | IV        |
| ---------------------------- | ---------- | ------------ | ---------- | --------- |
| **Activities** (what we do)  | Genesis    | Custom-Built | Product    | Commodity |
| **Practices** (how we do it) | Novel      | Emerging     | Good       | Best      |
| **Data**                     | Unmodelled | Divergent    | Convergent | Modelled  |
| **Knowledge**                | Concept    | Hypothesis   | Theory     | Accepted  |

Identify the type first, then apply the matching progression: "machine learning model" is an
activity, "MLOps" a practice, "customer behaviour data" data, "transformer architecture" knowledge.
A map of practices can relabel its x axis (the `evolution` statement — see the `owm-dsl` skill);
the modeler offers these four label sets as presets.

Watch for **co-evolution**: when an activity moves to Commodity, its practices must move too. A
Commodity activity run with novel or outdated practices is a mismatch worth a note.

## Context heuristics — a first hypothesis

These help with a first placement and with comparing a map against its industry. They are
hypotheses: confirm every placement with the characteristics above.

- **Start-up:** expect many Genesis and Custom-Built components; its commodities are rented.
- **Enterprise IT:** expect mostly Product and Commodity; Custom-Built components where products
  exist are an inertia signal.
- **"We built our own X":** question it — is Custom-Built justified, or is a Product or Commodity
  being resisted?
- **"Everyone uses X":** likely Product or Commodity.
- **"We're experimenting with X":** likely Genesis — unless the market already sells it.
- **Disruption:** look for compressed evolution and a value chain that is being restructured.

## The assessment process

For every component:

1. **Score all dimensions**, not one. A component can be common (Product) in ubiquity yet poorly
   understood (Custom-Built) in certainty. Weight towards the majority signal.
2. **Check the market evidence** — the strongest signal. How many competing providers? Published
   comparisons? Standard interfaces? Usage-based pricing?
3. **Ask the disappearance question:** "If this vanished tomorrow, would people be surprised it
   existed, or outraged it was gone?" Surprise points left (Genesis/Custom); outrage points right
   (Product/Commodity).
4. **Ask the failure question:** what happens when it breaks? A shrug → Genesis. A bug ticket →
   Custom-Built. An incident report → Product. A news headline → Commodity.
5. **Place it within the stage** (early or late, table above) and **write a one- or two-sentence
   rationale** citing the evidence. "Three providers with interchangeable APIs and published
   per-request pricing" is a rationale. "Feels like a product" is not.

When dimensions disagree, place by the majority and record the tension in the rationale: "Product
(0.45) — ubiquity says Commodity, but the market is still fragmenting."

## Common assessment mistakes

- **Novel to you is not novel to the market.** Building something for the first time does not make
  it Genesis. If fifty vendors sell it, it is Product — and you should probably buy it.
- **Old is not Commodity.** A thirty-year-old bespoke COBOL system is still Custom-Built if no
  product market exists for it.
- **Complex is not Genesis.** ERP is enormously complex and firmly Product.
- **Placing components where you wish they were.** The map shows where things are; `evolve` arrows
  show where they are heading. A "planned" commodity is not yet a commodity.
- **Evolution backwards.** Components never move left. An `evolve` target smaller than the current
  maturity is an error; if the organisation is replacing a utility with a bespoke build, that is a
  _new_ component further left, not the old one moving.
- **Ignoring practices.** A Commodity activity operated with Genesis-stage practices (or the
  reverse) creates cost and risk the activity's position alone does not show.
- **Anchoring the user's position.** The anchor's own x position carries little meaning; do not
  read stage conclusions from it.

> Adapted from haberlah/wardley-mapping (MIT). Evolution characteristics and evolution types follow
> Simon Wardley, _Wardley Maps_ (https://wardleymaps.com), CC BY-SA 4.0.
