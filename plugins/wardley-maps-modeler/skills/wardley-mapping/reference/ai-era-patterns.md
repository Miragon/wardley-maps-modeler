# AI-era patterns (as of 2026)

Read this when a map contains software or AI components, or when the question is build vs buy for
software. It is a **snapshot as of 2026**: AI components move faster than almost anything else on a
map, so verify placements against current market evidence and date the map (see the end of this
file).

## What changed, and what did not

**Building got cheaper for well-specified work.** AI coding assistants and agents write scaffolding,
CRUD applications, integrations against documented APIs, test scaffolding and documentation far
faster than before. The size of the effect is contested: reports range from large speed-ups on
greenfield, well-defined tasks to no gain — and at least one 2025 randomised study found experienced
developers _slower_ with AI tools on their own large, mature repositories. Treat any single
productivity number with suspicion, especially from vendors.

**What did not change:** deciding _what_ to build, encoding domain rules nobody has written down,
architecture trade-offs, integration with undocumented legacy behaviour, compliance
interpretation, review and accountability. And the cost of **owning** code — maintenance, security
fixes, upgrades, on-call — is not the cost of writing it.

**The consequence for maps:** a cheaper build changes the build-vs-buy economics _within_ a stage.
It does not by itself move a component right. Evolution is about market and certainty — move a
component right only when you can name the products, utilities or standard practices that make it
so.

## Components that have moved right

| Component                                    | Typical placement before | As of 2026                               | Evidence to look for                                                      |
| -------------------------------------------- | ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| Foundation-model inference                   | Genesis                  | Product `0.55–0.7`, heading right        | Several providers, per-token pricing, compatible APIs, open-weight models |
| Speech-to-text, OCR, machine translation     | Product                  | Commodity `0.75–0.85`                    | Utility APIs from many providers at commodity prices                      |
| Embeddings, vector search                    | Genesis, Custom-Built    | Product `0.5–0.65`                       | Vector features in mainstream databases, managed services                 |
| Simple internal admin tools, CRUD apps       | Custom-Built `0.25–0.35` | Product `0.45–0.6`                       | Low-code and AI app builders that generate them                           |
| Integrations against documented APIs         | Custom-Built             | `0.35–0.5`                               | Integration platforms; connectors generated from API specs                |
| Unit-test scaffolding, API documentation     | Custom-Built             | Product `0.5–0.65`                       | Built into IDEs, CI and documentation tools                               |
| Generic retrieval-augmented generation (RAG) | Genesis                  | late Custom-Built to Product `0.35–0.55` | Managed retrieval offerings from cloud and model providers                |

## Components that stay left

- **Domain-specific business logic** — rules that live in people's heads and in decades of code.
- **Agent orchestration and tool use in production** — Custom-Built `0.2–0.35`: frameworks exist,
  a settled practice does not.
- **Evaluation of AI systems (evals)** — Custom-Built; the practice is emerging.
- **Domain context and proprietary data pipelines** — Custom-Built; generic retrieval is
  commoditising, retrieval tuned to one domain is not.
- **AI governance, guardrails, accountability** — Custom-Built to early Product, varying by
  regulation.
- **Product strategy** — what to build is not automated.

## Build vs buy, adjusted

| Stage                               | Traditional advice        | AI-era adjustment                                                                                                    |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Genesis                             | Build                     | Build. AI speeds up experiments; it does not reduce the uncertainty of building the wrong thing.                     |
| Custom-Built, simple                | Build, watch for products | **Prototype first.** A working prototype is now cheap; decide build vs buy with it in hand.                          |
| Custom-Built, complex, domain-heavy | Build with specialists    | Build. AI assists the specialists; it does not replace the domain knowledge.                                         |
| Product                             | Buy                       | Usually still buy. Re-evaluate only narrow uses of an expensive product — and count ownership costs, not build time. |
| Commodity                           | Buy, rent, outsource      | Buy or rent. AI changes nothing here: never rebuild a commodity because building got cheaper.                        |

## Patterns to look for

1. **Compression.** AI components cross the evolution axis in years, not decades — foundation
   models went from Genesis to Product within a few years. Use short horizons for `evolve` arrows
   and revisit AI-heavy maps every few months.
2. **Value migrates up the chain.** As models commoditise, differentiation moves above them:
   proprietary data, domain context, workflow integration, evaluation, trust, distribution. Expect
   the new Genesis frontier directly above the model.
3. **The inertia paradox.** Young custom builds — an in-house RAG pipeline, self-hosted model
   serving — acquire inertia quickly while managed alternatives appear. Flag inertia on recent
   Custom-Built components that already face Product alternatives.
4. **Shadow builds.** Tools built quickly with AI help, outside normal ownership and review. They
   work, nobody owns them, and they duplicate official components. Map them explicitly — they are a
   duplication finding and a risk.
5. **Practice co-evolution.** AI-assisted development is itself a practice moving from emerging to
   good practice. An organisation that still estimates custom work with pre-AI assumptions misjudges
   both cost and speed; one that adopted it without review practices accumulates unowned code.

## Placement guidance

- **Name the evidence** for every AI component's placement: providers, pricing model, standard
  interfaces, mainstream adoption.
- **Prefer a conservative position plus an `evolve` arrow** over an optimistic position.
  `Foundation Model [0.36, 0.64]` with `evolve Foundation Model 0.8` says more than placing it at
  `0.8`.
- **Split model, data and practice** — they evolve on different axes: the model as an activity, the
  training or context data as data (unmodelled → modelled), prompting and evals as practices
  (novel → best).
- **A model API is rarely the differentiator.** The candidates are the user's data, context,
  evaluation and workflow.
- **Date the map** when AI components dominate it: put the date in the title ("AI Coding Agent —
  2026-10") or in a slate note (`#4A4A4A`).

## In the commentary

- Product-stage software bought at high cost but used narrowly: mention the prototype-first option,
  together with the ownership costs it creates.
- Commodity components: never recommend rebuilding them with AI.
- Genesis components: AI accelerates experiments, not certainty.
- Say explicitly that placements of AI components are time-sensitive and as of when they were made.

> Adapted from haberlah/wardley-mapping (MIT), revised to separate build cost from evolution and to
> remove vendor-survey figures. Evolution concepts follow Simon Wardley, _Wardley Maps_, CC BY-SA
> 4.0.
