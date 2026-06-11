# A Wardley Map of this Wardley Mapping tool

This map explains — in the tool's own language — which needs the tool serves, why it ships
**both** a browser app and a VS Code extension, and why "maps as text" plus AI agents is the
play that matters. It is written for people who own business topics and understand technology,
not for IT architects.

![Wardley Map of the tool](tool-landscape.png)

**Open it live:** [in the web app](https://wardley-maps.netlify.app/#mz=dZPPjpswEMbvfoo5rXalgoAQEy5I2T-VKm1PVLuHiIMXRsFax0a2o21UVepD9An7JJVNmpiE3oD5zXxjfx-WW4HwynQn8ABf2TBwuYVvSgn48-s32B5BMNmZlg0Ib9hz2QG3ZOADCi5x0mFgk8SLxfITJDFNywZuD5DEyyy_Iz8IQKt2g5IoLbzU8KA6hKfvFqXhSvrGIm8m1L1WHwY1rIfB1Ze0IT_JuVxzu2eWK8kErD-YRonGb7DyC2SUNgG9Fnwrd-7pBh6x5U71SKd-3yQN8X_Hcud_Pp1_k8QF9fgim-B1z7TDb-CRm3ZvjHtxdD4Ozyf0Czd7JpwGPHXcKu1QSqlD82yy9RdYb1Ha8WZzBywTeqmM8Mzlu0NGuWI1UTte9iaJ05XXKBa0gVtslTkYi7u7AH7Ft9O9b5I4K73mKs3DiZ-5QKh9r586Ol4mWUOYbHulobaaWdxyYx1QZuXoSBEA7B17JTrUZkSKMTW0IUFzVM3bTCb9UTVvL5mPSFTN20vmM-J2mLGXzEckqq7tJWGSj-NGzy4rwfWT65_EzR4_ktnARVX4z_x_wVOqThpRFZpKzrG7KFwn97zTeVHyFw)
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

Both needs only stay served if the maps stay **alive**: a map that is drawn once and pasted
into a slide deck dies the day after the workshop. A map that lives as a plain file next to
the everyday work — openable, diffable, editable — stays current.

## Browser vs. VS Code — one tool, two variants (the pipeline)

On the map the tooling is drawn as a **pipeline**: one capability ("Mapping Tools", the
square anchor) with two concrete variants inside the box — the **VS Code extension** further
left, the **browser app** further right. Both share the same editor engine; they
differ in **who they serve and when**:

|               | **Browser app**                                       | **VS Code extension**                              |
| ------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Best for      | Workshops, meetings, first contact                    | Continuous work, maps alongside code & docs        |
| Entry barrier | None — open a link, no install, no account            | You already live in VS Code                        |
| Sharing       | **Share link** — the whole map travels inside the URL | Git — versioned, diffed and reviewed like any file |
| Map lifetime  | The conversation                                      | The product / the repository                       |

That is why neither replaces the other: the browser app wins **adoption** (zero friction —
anyone in the meeting can open the map), the VS Code extension wins **longevity** (the map is
versioned and reviewed exactly like the work it describes). Like every pipeline, expect more
variants over time — the format underneath stays the same.

## Why text + agents — the ecosystem play

Underneath everything on this map sits one quiet design decision: **every map is plain
text** (the [OWM format](https://onlinewardleymaps.com)). The share link, the `.wmap` file on
the file system and the VS Code editor all speak the same few lines of readable text.

Text is the API. Because of it:

- **AI agents** (Copilot, Claude & co. — already in your editor) can draft a first map from a
  description, review an existing one, or update it when the underlying reality changes. The
  red arrow shows where this is heading: agents are racing to the right and become routine.
- Any other tool can produce or consume maps — no exporter, no lock-in, no screenshot graveyard.

And the map marks one component with the dotted ecosystem ring: **VS Code itself**. Millions of developers, their extensions and — increasingly — their AI agents already
live there. Shipping a plugin into that ecosystem is far cheaper than building another app and
puts the maps exactly where the agents are.

This is a classic ecosystem move: standardise the boring part (the format) and let everyone —
humans in two apps, agents, other tools — build on top of it. The value of the tool grows with
every consumer of the format, not just with its own feature list.

## The boring foundation (and why that is good)

Web browser, VS Code and the file system sit bottom-right: commodities everyone already has.
The tool deliberately builds **nothing novel** there — custom effort goes only into the parts
that differentiate it (the editor experience and the mapping semantics). That, too, is Wardley
doctrine: use appropriate methods per evolution stage.
