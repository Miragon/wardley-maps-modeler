# Third-party content

The `wardley-maps-modeler` plugin is MIT-licensed (see the
[repository LICENSE](https://github.com/Miragon/wardley-maps-modeler/blob/main/LICENSE)). Some of
its content is adapted from the MIT-licensed sources below; the method it teaches is Simon
Wardley's.

## haberlah/wardley-mapping

Source: [github.com/haberlah/wardley-mapping](https://github.com/haberlah/wardley-mapping)
(commit `076da69721935404b7478385dc14cf4d5db9fb07`), MIT License, Copyright (c) 2026 haberlah.

Adapted files — rewritten for the OWM dialect of the Wardley Maps Modeler, merged with existing
content and edited for this plugin:

| File in this plugin                                                         | Adapted from                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `skills/wardley-mapping/reference/evolution-assessment.md`                  | `references/evolution-assessment.md`                         |
| `skills/wardley-mapping/reference/creating-maps.md`                         | `SKILL.md` (create workflow, commentary template, checklist) |
| `skills/wardley-mapping/reference/ai-era-patterns.md`                       | `references/ai-era-patterns.md`                              |
| `skills/wardley-mapping/examples/{tea-shop,saas-platform,ai-startup}.wmap`  | `references/examples/{tea-shop,saas-platform,ai-startup}.md` |
| parts of `skills/wardley-mapping/reference/doctrine.md`                     | `references/doctrine-and-gameplay.md`                        |
| parts of `skills/wardley-mapping/reference/concepts.md`                     | `references/doctrine-and-gameplay.md`                        |
| parts of `skills/wardley-mapping/SKILL.md` (request table, create workflow) | `SKILL.md` (Handling Different User Requests, workflow)      |

Not used: the upstream React rendering template, style constants, Python scripts and
`references/owm-syntax.md` (its syntax differs from the parser of the Wardley Maps Modeler; the
`owm-dsl` skill is the format reference here).

```text
MIT License

Copyright (c) 2026 haberlah

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Online Wardley Maps

Source: [github.com/damonsk/onlinewardleymaps](https://github.com/damonsk/onlinewardleymaps)
(commit `71f2aad88ae83862fdce27c55c6733b8ba1009aa`), MIT License, Copyright (c) 2019 Damon
Skelhorn. Online Wardley Maps created the OWM text format that `.wmap` / `.owm` files use; the
`owm-dsl` skill documents the dialect the Wardley Maps Modeler parses.

The tea shop map — `skills/wardley-mapping/examples/tea-shop.wmap`, its copy in
`skills/wardley-mapping/reference/creating-maps.md` and the shortened version in `README.md` —
follows the example map in `frontend/src/constants/defaults.ts`. Changes: label offsets, the
`style` line and the generic note dropped, inertia and sourcing marked, the annotations rewritten
as colour-coded review notes, positions nudged where the modeler's layout needed it.

```text
MIT License

Copyright (c) 2019 Damon Skelhorn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Simon Wardley — Wardley Mapping

Wardley Mapping was created by Simon Wardley. His book
[_Wardley Maps_](https://medium.com/wardleymaps) is published under the
[Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/);
see [wardleymaps.com](https://wardleymaps.com) for the original framework.

The `wardley-mapping` skill describes his method — evolution stages and their characteristics,
doctrine, climatic patterns, gameplay, pioneers / settlers / town planners — in original prose
written for this plugin, with attribution to him. It keeps his terminology so that maps and reviews
use the vocabulary practitioners know; its tables are condensed working summaries in the skill's
own wording, not copies of the book's text or figures. Read the book for the full framework.

The tea shop is the scenario Wardley teaches with; the map shipped here is not taken from the book
but follows the Online Wardley Maps example map (see above).
