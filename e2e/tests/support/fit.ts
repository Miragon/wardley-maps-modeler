import type { Page } from '@playwright/test';

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const LONG_NAME = 'A commodity whose name runs on for many words and far beyond the plot';

/** A commodity whose name runs far past the plot's right edge: the content is wider than the plot. */
export const LONG_NAME_MAP = `title Long name
component Kettle [0.43, 0.35]
component ${LONG_NAME} [0.5, 0.97]
Kettle -> ${LONG_NAME}
`;

/**
 * Px a fitted name may still reach out of the free rectangle. Chromium on Linux lays SVG text out
 * at the scaled font size, so the name is a few px wider at the fitted zoom than at the zoom its
 * content box was measured at, once per change of the map (contract 1.3). Bounds of the plot
 * alone leave it over 100 px outside.
 */
export const FIT_TOLERANCE = 8;

/** The drawing of the commodity with the long name, its label included. */
export const LONG_NAME_DRAWING = '.djs-shape[data-element-id^="cmp_a_commodity"] > .djs-visual';

/**
 * How many px the drawing `selector` reaches out of the free rectangle, the canvas minus the
 * chrome's fit insets (guide §5.9); 0 when it lies inside.
 */
export function overhang(page: Page, selector: string, insets: Insets): Promise<number> {
  return page.evaluate(
    ({ selector, insets }) => {
      const canvas = document.querySelector('.djs-container')!.getBoundingClientRect();
      const drawn = document.querySelector(selector)!.getBoundingClientRect();
      return Math.max(
        0,
        canvas.left + insets.left - drawn.left,
        canvas.top + insets.top - drawn.top,
        drawn.right - (canvas.right - insets.right),
        drawn.bottom - (canvas.bottom - insets.bottom),
      );
    },
    { selector, insets },
  );
}
