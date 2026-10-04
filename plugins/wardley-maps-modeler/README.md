# Wardley Maps Modeler — Claude Code plugin

Two skills that teach Claude [Wardley Mapping](https://learnwardleymapping.com/) and the OWM text
format (`.wmap` / `.owm`) used by the [Wardley Maps Modeler](https://github.com/Miragon/wardley-maps-modeler).

| Skill             | What it covers                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wardley-mapping` | Simon Wardley's method: value chains, the evolution axis (genesis → custom-built → product → commodity), doctrine, climatic patterns and gameplay, creating maps from a strategic question, and map reviews with colour-coded feedback notes. |
| `owm-dsl`         | The OWM format itself: full grammar, `[visibility, maturity]` coordinates and layout, evolve / pipeline / inertia / notes / annotations, parser diagnostics and their pitfalls, the round-trip guarantee, web-app share links.                |

Together they let Claude read, review, edit and generate Wardley Maps as plain text — in any
repository, next to the VS Code extension, and in Miragon AI Design. Claude never renders a map
itself: it writes the `.wmap` / `.owm` file and the modeler draws it.

## Install

```
/plugin marketplace add Miragon/wardley-maps-modeler
/plugin install wardley-maps-modeler@wardley-maps
```

From a local checkout instead:

```
/plugin marketplace add /path/to/wardley-maps-modeler
/plugin install wardley-maps-modeler@wardley-maps
```

Once installed the skills are available everywhere as `wardley-maps-modeler:wardley-mapping` and
`wardley-maps-modeler:owm-dsl`. They load on demand — only their short descriptions stay in context.

## Using them

Nothing to invoke by hand. The skills trigger when you ask Claude to work on Wardley Maps:

- "Review this map and tell me what's weak" → `wardley-mapping`
- "Map our build-vs-buy decision for the payment platform as a `.wmap`" → both
- "Explain pioneers, settlers and town planners" → `wardley-mapping`
- "Why does this link not show up in my `.owm` file?" → `owm-dsl`

You can also call them explicitly with `/wardley-maps-modeler:owm-dsl`.

## A `.wmap` map in 30 seconds

```owm
title Tea Shop
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.8]
component Kettle [0.43, 0.35]
component Power [0.1, 0.71] (outsource)
note Kettle: buy, do not build [0.49, 0.35] (color #92610A)
evolve Kettle 0.62
Business -> Cup of Tea
Cup of Tea -> Tea
Cup of Tea -> Hot Water
Hot Water -> Kettle
Kettle -> Power
```

Coordinates are `[visibility, maturity]`, both from 0 to 1: visibility runs from the user need at
the top (1) down to invisible infrastructure (0), maturity from genesis on the left (0) to
commodity on the right (1). The amber note is the kind of feedback a review adds.

Open it in the [web app](https://wardley-maps.modeler.miragon.io) (open or drop the file), in the
`miragon-gmbh.wardley-mapping-modeler` VS Code extension (a custom editor for `.wmap` / `.owm`), or
in Miragon AI Design, where Claude writes and reads the file directly and the modeler renders it.
To process maps in code, parse them with
[`@miragon/wardley-dsl`](https://www.npmjs.com/package/@miragon/wardley-dsl).

## Development

The skills are plain markdown under `skills/`. After editing, validate them:

```bash
claude plugin validate plugins/wardley-maps-modeler --strict
claude plugin validate .            # the marketplace manifest
```

Every `owm`-tagged code block and every `*.wmap` / `*.owm` file in this plugin must parse with
zero diagnostics and survive a serialize round-trip unchanged; the repository's test suite
(`npm test`) enforces this, so run it after touching an example. Use `text` blocks for fragments
and deliberately broken snippets.

Keep `version` in `.claude-plugin/plugin.json` and the matching entry in the repository's
`.claude-plugin/marketplace.json` in sync — `claude plugin tag` enforces it.

## License

MIT — see the [repository LICENSE](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE).
Parts of the method content and the example maps are adapted from
[haberlah/wardley-mapping](https://github.com/haberlah/wardley-mapping) (MIT); the tea shop map
follows the example map of [Online Wardley Maps](https://github.com/damonsk/onlinewardleymaps)
(MIT). Wardley Mapping itself is Simon Wardley's method; the skills describe it in their own words
and credit his book _Wardley Maps_ (CC BY-SA 4.0). See [THIRD-PARTY.md](THIRD-PARTY.md).
