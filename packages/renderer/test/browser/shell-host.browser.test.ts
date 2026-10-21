import { afterEach, describe, expect, it } from 'vitest';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import { Modeler, type FreeRectInsets, type PanConstraint } from '../../src/index.js';
import type EvolutionGrid from '../../src/evolution-grid/EvolutionGrid.js';
import { fitViewbox } from '../../src/io/fitViewbox.js';
import type { WardleyShape } from '../../src/model/di-types.js';
import '../../src/assets/wardley.css';

/**
 * The renderer inside a host chrome such as @miragon/modeler-shell, which the renderer never
 * imports: the shell registers a `modelerShell` service and sends Enter or Space on a palette
 * entry as a click with `detail === 0`. A stand-in service is enough to switch the renderer over.
 */
const shellStandIn: ModuleDeclaration = { modelerShell: ['value', { host: 'ide' }] };

const MAP = `title Host
component Kettle [0.43, 0.35]
component Power [0.1, 0.71]
Kettle -> Power`;

const INSETS: FreeRectInsets = { top: 88, right: 24, bottom: 64, left: 24 };

let container: HTMLElement | undefined;
let modeler: Modeler | undefined;
const extras: HTMLElement[] = [];

function mount(
  options: { shell?: boolean; insets?: FreeRectInsets; width?: number; height?: number } = {},
): Modeler {
  container = document.createElement('div');
  document.body.appendChild(container);
  modeler = new Modeler({
    container,
    width: options.width ?? 1024,
    height: options.height ?? 768,
    additionalModules: options.shell ? [shellStandIn] : [],
    ...(options.insets ? { freeRectInsets: () => options.insets! } : {}),
  });
  return modeler;
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
  for (const extra of extras.splice(0)) extra.remove();
  modeler = undefined;
  container = undefined;
});

function entry(target: Modeler, action: string): HTMLElement {
  const element = target.container.querySelector<HTMLElement>(
    `.djs-palette .entry[data-action="${action}"]`,
  );
  if (!element) throw new Error(`no palette entry ${action}`);
  return element;
}

function click(element: HTMLElement, detail: number): void {
  const box = element.getBoundingClientRect();
  element.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    }),
  );
}

function components(target: Modeler): string[] {
  return target
    .exportMap()
    .elements.filter((element) => element.elementType === 'component')
    .map((element) => element.id);
}

describe('inside a host chrome (the Miragon modeler shell)', () => {
  it('leaves the palette to the chrome: no native title, no own skin, tab stops or toolbar role', async () => {
    const target = mount({ shell: true });
    await target.importDSL(MAP);
    const palette = target.container.querySelector<HTMLElement>('.djs-palette')!;
    expect(palette.classList.contains('wardley-palette')).toBe(false);
    expect(palette.hasAttribute('role')).toBe(false);
    for (const element of palette.querySelectorAll<HTMLElement>('.entry')) {
      expect(element.hasAttribute('title'), element.dataset['action']).toBe(false);
      expect(element.hasAttribute('tabindex'), element.dataset['action']).toBe(false);
    }
    expect(entry(target, 'lasso-tool').getAttribute('aria-label')).toBe('Lasso');
    expect(entry(target, 'draw-tool').getAttribute('aria-label')).toBe('Draw');
  });

  it('creates an element in the centre of the free rectangle on a keyboard click (guide §5.5)', async () => {
    const target = mount({ shell: true, insets: INSETS });
    await target.importDSL(MAP);
    const before = components(target);

    click(entry(target, 'create.component'), 0);

    const added = components(target).filter((id) => !before.includes(id));
    expect(added).toHaveLength(1);
    const selected = target.get<Selection>('selection').get() as unknown as WardleyShape[];
    expect(selected.map((shape) => shape.id)).toEqual(added);
    const created = selected[0]!;
    const viewbox = target.get<Canvas>('canvas').viewbox();
    const { width, height } = target.get<Canvas>('canvas').getSize();
    const freeCenter = {
      x: viewbox.x + (INSETS.left + (width - INSETS.left - INSETS.right) / 2) / viewbox.scale,
      y: viewbox.y + (INSETS.top + (height - INSETS.top - INSETS.bottom) / 2) / viewbox.scale,
    };
    expect(created.x + created.width / 2).toBeCloseTo(freeCenter.x, 0);
    expect(created.y + created.height / 2).toBeCloseTo(freeCenter.y, 0);
    expect(document.activeElement?.classList.contains('wardley-label-input')).toBe(true);
    expect(target.get<Canvas>('canvas').getContainer().contains(document.activeElement)).toBe(true);
  });

  it('steps 24px diagonally while the free centre is taken', async () => {
    const target = mount({ shell: true, insets: INSETS });
    await target.importDSL(MAP);
    click(entry(target, 'create.component'), 0);
    target.container.querySelector<HTMLInputElement>('.wardley-label-input')?.blur();
    click(entry(target, 'create.component'), 0);
    const created = target
      .exportMap()
      .elements.filter((element) => element.elementType === 'component')
      .slice(-2);
    const [a, b] = created.map((element) => element.position);
    expect(b!.evolution).toBeGreaterThan(a!.evolution);
    expect(b!.visibility).toBeLessThan(a!.visibility);
  });

  it('still follows the pointer on a pointer click', async () => {
    const target = mount({ shell: true, insets: INSETS });
    await target.importDSL(MAP);
    const before = components(target);
    click(entry(target, 'create.component'), 1);
    expect(components(target)).toEqual(before);
  });

  it('leaves keys aimed at the chrome outside the canvas alone', async () => {
    const target = mount({ shell: true, insets: INSETS });
    await target.importDSL(MAP);
    const zoomButton = document.createElement('button');
    document.body.appendChild(zoomButton);
    extras.push(zoomButton);
    zoomButton.focus();
    const before = components(target);
    zoomButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(components(target)).toEqual(before);
  });

  it('leaves a view the host fitted to the plot where it is while a label reaches beyond it', async () => {
    // Wide and low, as in a host's widget: the fit is limited by the height.
    const editor = mount({ insets: INSETS, width: 1440, height: 790 });
    await editor.importDSL(
      'title Host\ncomponent A considerably long commodity name [0.6, 0.98]\ncomponent B [0.3, 0.4]',
    );
    const canvas = editor.get<Canvas>('canvas');
    const grid = editor.get<EvolutionGrid>('evolutionGrid');
    const plot = grid.outerBounds();
    const content = editor.get<PanConstraint>('panConstraint').contentBounds();
    expect(content.x + content.width).toBeGreaterThan(plot.x + plot.width + 40);

    const fitted = fitViewbox(plot, canvas.getSize(), INSETS)!;
    canvas.viewbox(fitted);
    const after = canvas.viewbox();
    // diagram-js rounds the scale and the translation to three decimals
    expect(after.x).toBeCloseTo(fitted.x, 0);
    expect(after.y).toBeCloseTo(fitted.y, 0);
  });

  it('leaves the fit of the plot where it is while a label makes the content wider than the free area', async () => {
    // the fit is bound by the height and leaves side margins wider than the constraint's
    // slack, and the free area is narrow enough that the label's overhang outgrows it by
    // far, whatever the platform's font measures (1440 left a margin of 8 units on macOS)
    const size = { width: 1300, height: 790 };
    const editor = mount({ insets: INSETS, ...size });
    const name =
      'A commodity whose name runs on for many words and far beyond the right edge of the plot';
    await editor.importDSL(`title Host\ncomponent ${name} [0.6, 0.97]\ncomponent B [0.3, 0.4]`);
    const canvas = editor.get<Canvas>('canvas');
    const plot = editor.get<EvolutionGrid>('evolutionGrid').outerBounds();
    const fitted = fitViewbox(plot, canvas.getSize(), INSETS)!;
    const content = editor.get<PanConstraint>('panConstraint').contentBounds();
    const freeWidth = (size.width - INSETS.left - INSETS.right) / canvas.viewbox().scale;
    expect(content.width).toBeGreaterThan(freeWidth);

    // The import's own fit, then the host's fit of the same bounds after the user panned.
    expect(canvas.viewbox().x).toBeCloseTo(fitted.x, 0);
    canvas.viewbox({ ...fitted, x: fitted.x + 200 });
    canvas.viewbox(fitted);
    expect(canvas.viewbox().x).toBeCloseTo(fitted.x, 0);
    expect(canvas.viewbox().y).toBeCloseTo(fitted.y, 0);
  });

  it('without a host chrome, a focused plain button still lets the single-key tools through', async () => {
    const target = mount();
    await target.importDSL(MAP);
    const button = document.createElement('button');
    document.body.appendChild(button);
    extras.push(button);
    button.focus();
    const before = components(target);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(components(target)).toHaveLength(before.length + 1);
  });
});
