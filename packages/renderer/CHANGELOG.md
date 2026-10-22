# Changelog

## [0.9.1](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.9.0...renderer-v0.9.1) (2026-10-22)


### Bug Fixes

* **renderer:** accept didi 12 as a peer dependency ([#155](https://github.com/Miragon/wardley-maps-modeler/issues/155)) ([b6576e0](https://github.com/Miragon/wardley-maps-modeler/commit/b6576e0fd871288833eccd8cc42990285d53f9d8))

## [0.9.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.8.0...renderer-v0.9.0) (2026-10-21)


### Features

* **renderer:** implement modeler-api contract 1.2 and the Design IQ follow-ups ([#142](https://github.com/Miragon/wardley-maps-modeler/issues/142)) ([1839416](https://github.com/Miragon/wardley-maps-modeler/commit/1839416e80fea54098564d3a26d1d05c85a34547))

## [0.8.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.7.0...renderer-v0.8.0) (2026-10-20)


### Features

* implement the modeler-api contract and mount the modeler shell in VS Code and the web app ([#134](https://github.com/Miragon/wardley-maps-modeler/issues/134)) ([4510c7a](https://github.com/Miragon/wardley-maps-modeler/commit/4510c7a629be826fa27ad563ff49700e4121a1f9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.6.0 to 0.7.0

## [0.7.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.6.3...renderer-v0.7.0) (2026-10-17)


### Features

* UX overhaul of the modeler and undoable, DSL-safe map resizing ([#131](https://github.com/Miragon/wardley-maps-modeler/issues/131)) ([4416f8f](https://github.com/Miragon/wardley-maps-modeler/commit/4416f8f8840b90f1b17ce5692b8496364b4e3dcb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.3 to 0.6.0
    * @miragon/wardley-schema-model bumped from 0.5.1 to 0.6.0

## [0.6.3](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.6.2...renderer-v0.6.3) (2026-10-08)


### Bug Fixes

* **dsl:** never throw, keep round-trips stable and report what the parser drops ([#121](https://github.com/Miragon/wardley-maps-modeler/issues/121)) ([dbf52c2](https://github.com/Miragon/wardley-maps-modeler/commit/dbf52c281eb38a2747032ed175833f1e9a827acb))
* **renderer:** keep connection hit areas behind nodes and on the drawn line ([#127](https://github.com/Miragon/wardley-maps-modeler/issues/127)) ([e849899](https://github.com/Miragon/wardley-maps-modeler/commit/e84989939586e5703372847b200f7e5b4eb43ec6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.2 to 0.5.3

## [0.6.2](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.6.1...renderer-v0.6.2) (2026-09-22)


### Bug Fixes

* **deps:** declare consumer-shared runtime libs as ranged peer dependencies ([#113](https://github.com/Miragon/wardley-maps-modeler/issues/113)) ([322523c](https://github.com/Miragon/wardley-maps-modeler/commit/322523ccf57cd3e8f4d4d235ee216400f3379ff1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.1 to 0.5.2
    * @miragon/wardley-schema-model bumped from 0.5.0 to 0.5.1

## [0.6.1](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.6.0...renderer-v0.6.1) (2026-08-06)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @miragon/wardley-dsl bumped from 0.5.0 to 0.5.1

## [0.6.0](https://github.com/Miragon/wardley-maps-modeler/compare/renderer-v0.5.0...renderer-v0.6.0) (2026-08-06)


### ⚠ BREAKING CHANGES

* drop embedded-image feature; add app tests, guardrails, per-module releases ([#90](https://github.com/Miragon/wardley-maps-modeler/issues/90))

### Code Refactoring

* drop embedded-image feature; add app tests, guardrails, per-module releases ([#90](https://github.com/Miragon/wardley-maps-modeler/issues/90)) ([e1229a3](https://github.com/Miragon/wardley-maps-modeler/commit/e1229a3bdaba6f735d01dc2e6776f3f74b1b2c79))
