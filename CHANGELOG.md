# Changelog

All notable changes to this project are documented here. From `0.2.1` onward the whole monorepo
shares a single version, tag (`vX.Y.Z`) and release; entries below `0.2.1` were consolidated from the
former per-package changelogs.

## [0.5.0](https://github.com/Miragon/wardley-maps-modeler/compare/v0.4.0...v0.5.0) (2026-07-17)


### Features

* adopt Miragon corporate identity across the modeler ([#71](https://github.com/Miragon/wardley-maps-modeler/issues/71)) ([6566db0](https://github.com/Miragon/wardley-maps-modeler/commit/6566db021e04fc0385287c106f77b65ff1f4b654))
* Miragon-tinted canvas background and copyright footer ([#76](https://github.com/Miragon/wardley-maps-modeler/issues/76)) ([b7b64ea](https://github.com/Miragon/wardley-maps-modeler/commit/b7b64ea90656501b3672f8fd5ba53c66ca579571))
* **webapp:** show Menu, Share and palette on the empty start screen ([#75](https://github.com/Miragon/wardley-maps-modeler/issues/75)) ([130dde4](https://github.com/Miragon/wardley-maps-modeler/commit/130dde4c1bf4d14df1fab9fcf710a4ebc6f75de9))

## [0.4.0](https://github.com/Miragon/wardley-maps-modeler/compare/v0.3.0...v0.4.0) (2026-07-07)


### Features

* **dev:** adopt documented Portless setup for worktree-aware dev URLs ([#54](https://github.com/Miragon/wardley-maps-modeler/issues/54)) ([806005b](https://github.com/Miragon/wardley-maps-modeler/commit/806005be67260b4b82d1193e37a5ca86f83861dd))
* **vscode:** add "Get Started" walkthrough ([#65](https://github.com/Miragon/wardley-maps-modeler/issues/65)) ([381e954](https://github.com/Miragon/wardley-maps-modeler/commit/381e9542010379722ce4c8e71157ffeb57cba9de))

## [0.3.0](https://github.com/Miragon/wardley-maps-modeler/compare/v0.2.1...v0.3.0) (2026-06-22)


### Features

* **webapp:** legal notice footer + Portless named dev URL ([#46](https://github.com/Miragon/wardley-maps-modeler/issues/46)) ([f9f189f](https://github.com/Miragon/wardley-maps-modeler/commit/f9f189f1f9b760dd10b83e142253ae105b74d00b))

## [0.2.1](https://github.com/Miragon/wardley-maps-modeler/compare/schema-model-v0.2.0...schema-model-v0.2.1) (2026-06-10)


### Bug Fixes

* **draw:** hit zone follows the drawing's stroke, not its bounding box ([#38](https://github.com/Miragon/wardley-maps-modeler/issues/38)) ([5898cb4](https://github.com/Miragon/wardley-maps-modeler/commit/5898cb4fe158b52263936937ca0a8a181a423992))
* **renderer:** single anchor for eponymous component + pipeline pairs ([#40](https://github.com/Miragon/wardley-maps-modeler/issues/40)) ([ae44a9f](https://github.com/Miragon/wardley-maps-modeler/commit/ae44a9fceb453ac668ed8449e442ab8a8491ddd1))

## 0.2.0 (2026-06-10)


### Features

* **renderer:** constrain pan/scroll to keep the map in view ([#11](https://github.com/Miragon/wardley-maps-modeler/issues/11)) ([345f137](https://github.com/Miragon/wardley-maps-modeler/commit/345f1372d66643e76cb82c2f0c4a48100189cc6d))
* **webapp:** add Miragon favicon ([#12](https://github.com/Miragon/wardley-maps-modeler/issues/12)) ([025f415](https://github.com/Miragon/wardley-maps-modeler/commit/025f415ba970bc4b8f1834fd0aa10f8d21c9a255))


### Bug Fixes

* **release:** unique Marketplace display name + independent idempotent npm publish ([#32](https://github.com/Miragon/wardley-maps-modeler/issues/32)) ([a366397](https://github.com/Miragon/wardley-maps-modeler/commit/a366397b7ed18ceb82c48f9a2665ba383833e8cb))
* repair release publishing (vscode packaging + npm dry-run footgun) ([#30](https://github.com/Miragon/wardley-maps-modeler/issues/30)) ([7865c15](https://github.com/Miragon/wardley-maps-modeler/commit/7865c1575f8cb0376cc92c8309696152c49a0597))

## 0.1.1 (2026-06-09)


### Miscellaneous Chores

* Synchronize wardley versions

## 0.1.0 (2026-06-09)


### Features

* **renderer:** constrain pan/scroll to keep the map in view ([#11](https://github.com/Miragon/wardley-maps-modeler/issues/11)) ([345f137](https://github.com/Miragon/wardley-maps-modeler/commit/345f1372d66643e76cb82c2f0c4a48100189cc6d))
* **webapp:** add Miragon favicon ([#12](https://github.com/Miragon/wardley-maps-modeler/issues/12)) ([025f415](https://github.com/Miragon/wardley-maps-modeler/commit/025f415ba970bc4b8f1834fd0aa10f8d21c9a255))


### Miscellaneous Chores

* Initial VS Code extension and web app.
