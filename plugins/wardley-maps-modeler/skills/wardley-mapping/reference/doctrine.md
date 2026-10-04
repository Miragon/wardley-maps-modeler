# Doctrine — Simon Wardley's universal principles

**Doctrine** is the set of principles that are useful **regardless of context** — unlike gameplay,
which only makes sense for a specific map. Wardley lists forty principles in **six categories**
(Communication, Development, Operation, Learning, Leading, Structure) and suggests adopting them in
**four phases**, each building on the last. Use them as a checklist when reviewing a map or the
organisation behind it.

## The four phases (the order to adopt them)

### Phase I — Stop self-harm

The basics without which an organisation hurts itself. Most review findings live here.

| Principle                              | Category      | In a map review, look for…                                                  |
| -------------------------------------- | ------------- | --------------------------------------------------------------------------- |
| Use a common language                  | Communication | The map itself is the shared language; are names understandable to all?     |
| Challenge assumptions                  | Communication | Every placement is a hypothesis — ask for the evidence.                     |
| Focus on high situational awareness    | Communication | Is the landscape understood before decisions are taken?                     |
| Know your users                        | Development   | An anchor that is a real user with needs, not "the system" or "IT".         |
| Focus on user needs                    | Development   | Needs directly below the anchor, in the user's words.                       |
| Remove bias and duplication            | Development   | The same capability drawn twice, or built by several teams.                 |
| Use appropriate methods                | Development   | Agile in Genesis, lean in Product, six sigma in Commodity — not one method. |
| Think small (know the details)         | Operation     | Components specific enough to place; no giant "Platform" box.               |
| Use a systematic mechanism of learning | Learning      | Maps revised over time, a bias towards data.                                |

### Phase II — Becoming more context aware

| Principle                                           | Category      | In a map review, look for…                                                   |
| --------------------------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| Be transparent                                      | Communication | Is the map shared so others can challenge it?                                |
| Focus on the outcome, not a contract                | Development   | Outsourcing and contracts that match the component's stage and outcome.      |
| Be pragmatic                                        | Development   | Neither over-engineering the uncertain nor under-engineering the industrial. |
| Use appropriate tools                               | Development   | Mapping, financial models, delivery tooling that fit the stage.              |
| Think FIRE (fast, inexpensive, restrained, elegant) | Development   | Small, cheap experiments for Genesis components.                             |
| Use standards where appropriate                     | Development   | Standards on Product/Commodity components, not on Genesis ones.              |
| Manage failure                                      | Operation     | Failure tolerated left, engineered out right.                                |
| Manage inertia                                      | Operation     | `inertia` marked where it really is, with a plan to overcome it.             |
| Effectiveness over efficiency                       | Operation     | Optimising a component that should not exist, or should be bought.           |
| A bias towards action                               | Learning      | The map leads to a decision, not a report.                                   |
| Move fast                                           | Leading       | "An imperfect plan executed today beats a perfect plan executed tomorrow."   |
| Strategy is iterative, not linear                   | Leading       | Map → act → re-map; never a one-off.                                         |
| Think small (as in teams)                           | Structure     | Small teams around components, not one big department.                       |
| Distribute power and decision making                | Structure     | Decisions where the situational awareness is.                                |
| Think aptitude and attitude                         | Structure     | Pioneers, settlers, town planners matched to stages (PST).                   |

### Phase III — Better for less

| Principle                                           | Category  | In a map review, look for…                                       |
| --------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| Optimise flow                                       | Operation | Bottlenecks along the value chain.                               |
| Do better with less                                 | Operation | Components that could be removed, merged or consumed as utility. |
| Set exceptional standards                           | Operation | Quality appropriate to each stage — high everywhere.             |
| A bias towards the new                              | Learning  | Is anyone exploring what the next commodity enables?             |
| Be the owner                                        | Leading   | Someone accountable for the whole landscape.                     |
| Be humble                                           | Leading   | Willingness to accept the map is wrong and improve it.           |
| Strategy is complex                                 | Leading   | Uncertainty acknowledged, no silver bullets.                     |
| Commit to the direction, be adaptive along the path | Leading   | Clear direction, flexible route.                                 |
| Think big                                           | Leading   | Ambition that matches the opportunity.                           |
| Provide purpose, mastery and autonomy               | Structure | Teams that know why, can grow, and may decide.                   |
| Seek the best                                       | Structure | Best people, practices and components — bought where better.     |

### Phase IV — Continuously evolving

| Principle                     | Category  | In a map review, look for…                                           |
| ----------------------------- | --------- | -------------------------------------------------------------------- |
| Listen to your ecosystems     | Learning  | Partners and users used as sensing engines (ILC).                    |
| Exploit the landscape         | Leading   | Plays chosen from the map, not from habit.                           |
| There is no core              | Leading   | No component treated as sacred — today's core is tomorrow's utility. |
| Design for constant evolution | Structure | Organisation and architecture built to keep moving right.            |
| There is no one culture       | Structure | Different cultures for different stages (PST), not one.              |

## Using doctrine in a review

Focus on the **two or three most impactful gaps**, not all forty principles. The ones a map
reveals most directly:

| Finding on the map                                        | Principle                           | Note colour and example wording               |
| --------------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| No anchor, or anchor wired straight to infrastructure     | Know your users, user needs         | Red — "No user need anchored"                 |
| Commodity hand-built, or `(build)` on a commodity         | Use appropriate methods             | Red — "Commodity: buy or rent, don't build"   |
| Differentiator `(outsource)`d                             | Use appropriate methods             | Red — "Edge outsourced: keep in-house"        |
| One capability drawn twice                                | Remove bias and duplication         | Amber — "Duplicate of Payments?"              |
| Established component, contracts, sunk cost, no `inertia` | Manage inertia                      | Amber — "Inertia: legacy contract"            |
| One team or method across all stages                      | Think aptitude and attitude         | Amber — "One team for Genesis and Commodity?" |
| Clean, well-anchored chain reaching commodities           | Focus on high situational awareness | Green — "Clear, well-anchored chain"          |
| A commodity that could support new higher-order value     | A bias towards the new              | Purple — "Utility frees R&D for X"            |

Note hex values are in `SKILL.md`; placement and wording rules in `review-playbook.md`.

> Source: Simon Wardley, _Wardley Maps_ (Doctrine chapter, https://wardleymaps.com), CC BY-SA 4.0.
> The phase and category assignment follows Wardley's published doctrine table; exact wording varies
> between editions. Treat this as a faithful working reference in original prose, not a verbatim
> copy. Cross-checked against haberlah/wardley-mapping (MIT).
