import type { Theme } from '@miragon/modeler-shell/core';

/**
 * The modes the webview can show. Wardley maps have no dark canvas yet (the Miragon modelers turn
 * dark together, guide §13.5), so the webview stays light in every VS Code theme instead of
 * showing dark chrome over a light map; high contrast still passes.
 */
export const WEBVIEW_THEMES: readonly Theme[] = ['light'];
