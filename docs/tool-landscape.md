# A Wardley Map of this Wardley Mapping tool

This map explains — in the tool's own language — which needs the tool serves, why it ships
**both** a browser app and a VS Code extension, and why "maps as text" plus AI agents is the
play that matters. It is written for people who own business topics and understand technology,
not for IT architects.

![Wardley Map of the tool](tool-landscape.svg)

**Open it live:** [in the web app](https://wardley-maps.netlify.app/#mz=dVXbattAEH3XVwwUQgKRke9yHwxuY9JASgsOyUPww1g7kRavd8Xu2o7f-hH9wn5J2ZUc65Y3W3N05szMmZHlVhC8oGaCTvAT85zLFJ6UEvDvz1-wGYFAyUyCOcGGMi4ZcBugTDKlYWU1Wkq5sfAa9WbTW4h6g3h9Dj8R7uAKVha3lCnBSJsLbjJYB4na5UqStLDido-WK4kCFkfUJMkU4MiTTqrgheCp3LlfV3BHCTdcSQ-OY88cVcHnmlwpjx-lvEa96cyBh3UZGWoHvoI7bpK9Me6PwxaSR1XsIz-46E_Mfe6Jh4xqdM_c7FE4CCwZt0o74LgA1kR-0-poSMMizx1kNGnX8byC74oRLN8tSVfxBTisARcPsEhJWq9q6AGj0TqggxIHqkSj3nTQKJ3gkcutJx6696Zxo5MG0MATvft5D3wh48karilR5mQs7W4q-DuOqcYdLGXKpW9537d8UhvmPS_I_OjiSVfJ7s2xD9cG8EKbj8Y5iJc8G9bmadHyBH4oY8tJRl50PFvDtdpbo_Y6oZugYuRw3m3GoMvN4bzbjEG3n8N5tx2Dbkc7KR2GDLotHc7bfvscWnFv0On6cF51ZVB1aKmrcEtQ3QOnoenTJuDDgUF7PRpJOwHtBA1tVZ82YxXPtEqqeSVo71uTuhNRPuwO3nMbXBawxddVbX2JgsqWNl-XyhL8ykkCgnAALgHlCTZlmSFIBVwai0LcAmeEAt6UhqPSW5Op4oqN-35D4zVcJ0ooDV_6bEQsvinofULBD-TInac05QpCOJB2NRIDlAw0HTgdiYHgW4KkXOGCOvqMulzBExjBGRlIFTipBCFYd3B2LrWxeAL0AtxV9oyD6MK4GY2H0axkLNvMNL7Z21KU17fPGVoqGNGAzbhMDSQZytTzDltNmNJg4O6E512ejx3kAk9ffR-8xDeld2iBG_9o8fsBQj8B6z6nSgM6QZCgBE1YtOqo-VmJO4L-Y9fvSPwf)
· or drag [`tool-landscape.wmap`](tool-landscape.wmap) onto the canvas of any running instance.

## How to read it (30 seconds)

- **Top = what users see and need.** Everything below is what those needs depend on.
- **Left → right = evolution.** Left is novel and hand-made, right is standard and boring —
  in the best sense. Things only ever move right.
- **Dashed red arrow** = expected movement. **Dotted ring** = an ecosystem forms around it.

## The needs this tool serves

Two kinds of users anchor the map:

- The **strategist** (product lead, department head, founder) needs **situational awareness**:
  a picture of the landscape that makes assumptions visible and discussable — that is
  _mapping the landscape_.
- The **team and stakeholders** need **alignment**: looking at the same picture, challenging
  it, and deciding — that is _sharing and discussing_.

Both needs rest on one quiet but decisive capability in the middle of the map: **living maps**.
A map that is drawn once and pasted into a slide deck dies the day after the workshop (the
amber note). A map that lives as a versioned text file next to the everyday work stays current.

## Browser vs. VS Code — two doors into the same room

Both apps share the same editor engine; they differ in **who they serve and when**:

|               | **Browser app**                                       | **VS Code extension**                              |
| ------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Best for      | Workshops, meetings, first contact                    | Continuous work, maps alongside code & docs        |
| Entry barrier | None — open a link, no install, no account            | You already live in VS Code                        |
| Sharing       | **Share link** — the whole map travels inside the URL | Git — versioned, diffed and reviewed like any file |
| Map lifetime  | The conversation                                      | The product / the repository                       |

That is why neither replaces the other: the browser app wins **adoption** (zero friction —
anyone in the meeting can open the map), the VS Code extension wins **longevity** (the map is
versioned and reviewed exactly like the work it describes).

## Why text + agents — the ecosystem play

The most important component sits low on the map: **maps as text** (the
[OWM format](https://onlinewardleymaps.com), marked with the dotted ecosystem ring). Every map
is a few lines of readable text — the share link, the `.wmap` file and the VS Code editor all
speak the same format.

Text is the API. Because of it:

- **AI agents** (Copilot, Claude & co. — already in your editor) can draft a first map from a
  description, review an existing one, or update it when the underlying reality changes. The
  red arrow shows where this is heading: agents are racing to the right and become routine.
- Any other tool can produce or consume maps — no exporter, no lock-in, no screenshot graveyard.

This is a classic ecosystem move: standardise the boring part (the format) and let everyone —
humans in two apps, agents, other tools — build on top of it. The value of the tool grows with
every consumer of the format, not just with its own feature list.

## The boring foundation (and why that is good)

Browser, VS Code, Git, static hosting and the diagram engine all sit bottom-right: commodities
and proven products. The tool deliberately builds **nothing novel** there — custom effort goes
only into the parts that differentiate it (the editor experience and the mapping semantics).
That, too, is Wardley doctrine: use appropriate methods per evolution stage.
