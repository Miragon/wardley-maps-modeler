import type { Theme } from '@miragon/modeler-shell/core';

/**
 * The modes the map can be drawn in: light only until the joint dark-mode release of the
 * modelers, as in the VS Code webview. A light-only web app writes `data-cd-theme="light"`
 * statically and shows no Appearance group (guide §13.3).
 */
export const THEMES: readonly Theme[] = ['light'];
