import { afterEach, describe, expect, it } from 'vitest';
import type { ElementBounds } from '@miragon/modeler-api';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  exportBounds,
  type CollaborativeWardleyModeler,
  type Modeler,
  type PanConstraint,
} from '../../src/index.js';
import type EvolutionGrid from '../../src/evolution-grid/EvolutionGrid.js';
import type { WardleyShape } from '../../src/model/di-types.js';
import type WardleyModeling from '../../src/modeling/WardleyModeling.js';
import '../../src/assets/wardley.css';

const MAP = `title Bounds
component Kettle [0.43, 0.35]
component Grid [0.5, 0.97]
Kettle -> Grid`;

const TWO_COMPONENTS = `title Drag
component Kettle [0.5, 0.5]
component Water [0.3, 0.3]`;

/** The manual-trigger surface of diagram-js Dragging that the test drives. */
interface ManualDragging {
  setOptions(options: { manual: boolean }): void;
  hover(event: { element: Element; gfx: SVGElement }): void;
  move(event: MouseEvent, activate?: boolean): void;
  cancel(): void;
}

const LONG_NAME = 'Grid power from a utility far beyond the right edge of the plot';

const mounted: Array<{ host: HTMLElement; modeler: CollaborativeWardleyModeler }> = [];

afterEach(() => {
  for (const { host, modeler } of mounted.splice(0)) {
    modeler.destroy();
    host.remove();
  }
});

function mount(create = createCollaborativeModeler): CollaborativeWardleyModeler {
  const host = document.createElement('div');
  host.style.width = '1200px';
  host.style.height = '800px';
  document.body.appendChild(host);
  const modeler = create();
  modeler.attachTo(host);
  mounted.push({ host, modeler });
  return modeler;
}

function plotOf(modeler: CollaborativeWardleyModeler): ElementBounds {
  return modeler.diagram.get<EvolutionGrid>('evolutionGrid').outerBounds();
}

function contentOf(modeler: CollaborativeWardleyModeler): ElementBounds {
  const box = modeler.contentBounds();
  if (!box) throw new Error('contentBounds() is undefined');
  return box;
}

function expectCovers(outer: ElementBounds, inner: ElementBounds): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
}

const right = (box: ElementBounds): number => box.x + box.width;

describe.each([
  ['the editor', createCollaborativeModeler],
  ['the viewer', createCollaborativeViewer],
])('contentBounds() of %s (contract 1.3)', (_name, create) => {
  it('is the plot with its axes before the first import and on a map without elements', async () => {
    const modeler = mount(create);
    expect(modeler.contentBounds()).toEqual(plotOf(modeler));

    await modeler.importText('title Empty\n');
    expect(modeler.elements.list()).toEqual([]);
    expectCovers(contentOf(modeler), plotOf(modeler));
  });

  it('is what the pan constraint keeps in view, around every element', async () => {
    const modeler = mount(create);
    await modeler.importText(MAP);
    const content = contentOf(modeler);
    expect(content).toEqual(modeler.diagram.get<PanConstraint>('panConstraint').contentBounds());
    expectCovers(content, plotOf(modeler));
    for (const { id } of modeler.elements.list())
      expectCovers(content, modeler.elements.bounds(id)!);
  });

  it('is in diagram coordinates: zoom and scroll leave it alone', async () => {
    const modeler = mount(create);
    await modeler.importText(MAP);
    const atRest = contentOf(modeler);
    const canvas = modeler.diagram.get<Canvas>('canvas');
    for (const zoom of [0.37, 2.5, 4]) {
      canvas.zoom(zoom);
      expect(modeler.contentBounds()).toEqual(atRest);
    }
    modeler.setViewState({ x: -300, y: 420, width: 640, height: 480 });
    expect(modeler.contentBounds()).toEqual(atRest);
  });

  it('hands out a copy the host may change', async () => {
    const modeler = mount(create);
    await modeler.importText(MAP);
    const box = contentOf(modeler);
    const before = { ...box };
    box.width = 1;
    expect(modeler.contentBounds()).toEqual(before);
  });

  it('is undefined once the modeler is destroyed', async () => {
    const modeler = mount(create);
    await modeler.importText(MAP);
    modeler.destroy();
    expect(modeler.contentBounds()).toBeUndefined();
  });
});

describe('contentBounds() of the editor reads the live canvas', () => {
  it('takes in a label renamed beyond the plot at once', async () => {
    const modeler = mount();
    await modeler.importText(MAP);
    const before = contentOf(modeler);
    const diagram = modeler.diagram as Modeler;
    const grid = diagram.get<ElementRegistry>('elementRegistry').get('cmp_grid');
    if (!grid) throw new Error('the map has no component cmp_grid');
    diagram.get<WardleyModeling>('wardleyModeling').updateLabel(grid as WardleyShape, LONG_NAME);

    const after = contentOf(modeler);
    expect(right(after)).toBeGreaterThan(right(before) + 100);
    expect(right(after)).toBeGreaterThan(right(plotOf(modeler)) + 100);
  });

  it('follows a resized plot, and its undo', async () => {
    const modeler = mount();
    await modeler.importText(MAP);
    const before = contentOf(modeler);
    const diagram = modeler.diagram as Modeler;
    await diagram.setMapSize(1500, 950);
    expectCovers(contentOf(modeler), plotOf(modeler));
    expect(contentOf(modeler).width).toBeGreaterThan(before.width + 300);

    diagram.undo();
    expect(modeler.contentBounds()).toEqual(before);
  });
});

describe('contentBounds() of the editor during a drag', () => {
  it('leaves out the preview of a move, also once the drag is cancelled', async () => {
    const modeler = mount();
    await modeler.importText(TWO_COMPONENTS);
    const diagram = modeler.diagram as Modeler;
    const canvas = diagram.get<Canvas>('canvas');
    const registry = diagram.get<ElementRegistry>('elementRegistry');
    const shape = (id: string): Shape => {
      const element = registry.get(id);
      if (!element) throw new Error(`the map has no element ${id}`);
      return element as Shape;
    };
    // A command forgets the measured box, so the next reading happens while the preview is drawn.
    diagram.get<Modeling>('modeling').moveElements([shape('cmp_water')], { x: 10, y: 0 });
    const drawn = exportBounds(canvas, diagram.get<EvolutionGrid>('evolutionGrid'), 0);

    const kettle = shape('cmp_kettle');
    const container = canvas.getContainer().getBoundingClientRect();
    const toClient = (x: number, y: number): MouseEventInit => {
      const { x: left, y: top } = canvas.viewbox();
      const zoom = canvas.zoom();
      return {
        clientX: container.left + (x - left) * zoom,
        clientY: container.top + (y - top) * zoom,
        bubbles: true,
        cancelable: true,
        button: 0,
      };
    };
    const centre = { x: kettle.x + kettle.width / 2, y: kettle.y + kettle.height / 2 };
    const dragging = diagram.get<ManualDragging>('dragging');
    dragging.setOptions({ manual: true });
    const mousedown = new MouseEvent('mousedown', toClient(centre.x, centre.y));
    Object.defineProperty(mousedown, 'target', { value: registry.getGraphics(kettle) });
    diagram
      .get<{ start(event: MouseEvent, shape: Shape, activate?: boolean): void }>('move')
      .start(mousedown, kettle, true);
    const root = canvas.getRootElement() as Element;
    dragging.hover({ element: root, gfx: registry.getGraphics(root) });
    dragging.move(new MouseEvent('mousemove', toClient(centre.x + 450, centre.y)));
    dragging.move(new MouseEvent('mousemove', toClient(centre.x + 900, centre.y)));
    expect(canvas.getContainer().querySelector('.djs-drag-group .djs-visual')).not.toBeNull();

    expect(modeler.contentBounds()).toEqual(drawn);
    dragging.cancel();
    expect(modeler.contentBounds()).toEqual(drawn);
  });
});
