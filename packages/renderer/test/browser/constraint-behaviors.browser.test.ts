import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import { Modeler } from '../../src/index.js';
import { isWardleyShape, type WardleyShape } from '../../src/model/di-types.js';
import type EvolutionGrid from '../../src/evolution-grid/EvolutionGrid.js';
import type WardleyDrawTool from '../../src/draw-tool/WardleyDrawTool.js';
import type WardleyEvolveDragging from '../../src/evolve/WardleyEvolveDragging.js';
import type WardleyModeling from '../../src/modeling/WardleyModeling.js';
import type WardleyElementFactory from '../../src/model/WardleyElementFactory.js';
import { DROP_TARGET_MARKER } from '../../src/pipeline/index.js';
// Pull the real stylesheet in so layout (getBBox) matches production. src/index.ts also imports it.
import '../../src/assets/wardley.css';

// DSL coords are [visibility, evolution].
const TEA_SHOP = `title Constraint Fixture
anchor Customer [0.95, 0.6]
component Kettle [0.35, 0.43]
component Water [0.38, 0.82]
component Power [0.1, 0.7]
Customer -> Kettle
Kettle -> Water`;

const PIPELINE_MAP = `title Pipeline Fixture
component Kettle [0.43, 0.6]
pipeline Kettle [0.25, 0.92]
{
  component Campfire Kettle [0.3]
  component Electric Kettle [0.82] (buy)
}
component Power [0.2, 0.75]
Kettle -> Power`;

const ATTITUDE_MAP = `title Attitude Fixture
component Kettle [0.35, 0.43]
settlers [0.6, 0.35, 0.2, 0.7]`;

const EVOLVE_MAP = `title Evolve Fixture
component Kettle [0.35, 0.43]
evolve Kettle 0.85`;

interface Point {
  x: number;
  y: number;
}

/** The manual-trigger surface of diagram-js Dragging that tests drive (typings require more). */
interface ManualDragging {
  setOptions(options: { manual: boolean }): void;
  hover(event: { element: Element; gfx: SVGElement }): void;
  move(event: MouseEvent, activate?: boolean): void;
  end(): void;
  context(): { data: { context: { shapes: unknown[] } } } | null;
}

describe('constraint behaviors (real browser DOM)', () => {
  let container: HTMLElement;
  let modeler: Modeler;

  beforeEach(() => {
    container = document.createElement('div');
    // Explicit pixel size: without it the canvas collapses to 0 height and getBBox boxes are empty.
    container.style.width = '1024px';
    container.style.height = '768px';
    document.body.appendChild(container);
    modeler = new Modeler({ container });
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  const registry = () => modeler.get<ElementRegistry>('elementRegistry');
  const modeling = () => modeler.get<Modeling>('modeling');
  const grid = () => modeler.get<EvolutionGrid>('evolutionGrid');
  const canvas = () => modeler.get<Canvas>('canvas');

  function shapeNamed(
    label: string,
    type: WardleyShape['wardleyType'] = 'component',
  ): WardleyShape {
    const shape = registry().find(
      (element) =>
        isWardleyShape(element) && element.wardleyLabel === label && element.wardleyType === type,
    ) as WardleyShape | undefined;
    if (!shape) throw new Error(`shape not found: ${type} ${label}`);
    return shape;
  }

  function firstOfType(type: WardleyShape['wardleyType']): WardleyShape {
    const shape = registry().find(
      (element) => isWardleyShape(element) && element.wardleyType === type,
    ) as WardleyShape | undefined;
    if (!shape) throw new Error(`shape not found: ${type}`);
    return shape;
  }

  const centerOf = (shape: WardleyShape): Point => ({
    x: shape.x + shape.width / 2,
    y: shape.y + shape.height / 2,
  });

  /** Plot-space offset (normalized) converted into canvas px for the current plot size. */
  function plotDelta(evolution: number, visibility: number): Point {
    const { width, height } = grid().getPlotSize();
    return { x: Math.round(evolution * width), y: Math.round(-visibility * height) };
  }

  function clientPoint(point: Point): { clientX: number; clientY: number } {
    const rect = canvas().getContainer().getBoundingClientRect();
    const viewbox = canvas().viewbox();
    const zoom = canvas().zoom();
    return {
      clientX: rect.left + (point.x - viewbox.x) * zoom,
      clientY: rect.top + (point.y - viewbox.y) * zoom,
    };
  }

  function mouseEvent(type: string, point: Point, init: MouseEventInit = {}): MouseEvent {
    return new MouseEvent(type, {
      ...clientPoint(point),
      bubbles: true,
      cancelable: true,
      button: 0,
      // Shift disables stage snapping, so the deltas in these tests land exactly.
      shiftKey: true,
      ...init,
    });
  }

  /** Real diagram-js mouse drag of a shape (Move + MovePreview + rules), driven manually. */
  function dragShape(
    shape: WardleyShape,
    delta: Point,
    options: { hover?: Element; beforeEnd?: () => void } = {},
  ): void {
    const dragging = modeler.get<ManualDragging>('dragging');
    const move = modeler.get<{
      start(event: MouseEvent, element: Shape, activate?: boolean): void;
    }>('move');
    dragging.setOptions({ manual: true });
    // At the fitted zoom one client pixel spans several canvas pixels; drag at 1:1 for exact deltas.
    canvas().zoom(1);
    const start = centerOf(shape);
    const mousedown = mouseEvent('mousedown', start);
    // diagram-js inspects the hit element of the mousedown.
    Object.defineProperty(mousedown, 'target', {
      value: registry().getGraphics(shape as unknown as Element),
    });
    move.start(mousedown, shape as unknown as Shape, true);
    const hover = options.hover ?? (canvas().getRootElement() as Element);
    dragging.hover({ element: hover, gfx: registry().getGraphics(hover) });
    dragging.move(mouseEvent('mousemove', { x: start.x + delta.x / 2, y: start.y + delta.y / 2 }));
    dragging.move(mouseEvent('mousemove', { x: start.x + delta.x, y: start.y + delta.y }));
    options.beforeEnd?.();
    dragging.end();
  }

  function expectUndoRedoStable(original: string, edited: string, steps = 1): void {
    for (let step = 0; step < steps; step++) modeler.undo();
    expect(modeler.exportDSL()).toBe(original);
    for (let step = 0; step < steps; step++) modeler.redo();
    expect(modeler.exportDSL()).toBe(edited);
  }

  describe('undo/redo keeps the model in sync with the geometry', () => {
    it('after a mouse move', async () => {
      await modeler.importDSL(TEA_SHOP);
      const original = modeler.exportDSL();

      const kettle = shapeNamed('Kettle');
      dragShape(kettle, plotDelta(0.15, 0.12));
      const moved = modeler.exportDSL();
      expect(kettle.visibility).toBeCloseTo(0.47, 2);
      expect(kettle.evolution).toBeCloseTo(0.58, 2);

      expectUndoRedoStable(original, moved);
    });

    it('after keyboard nudges', async () => {
      await modeler.importDSL(TEA_SHOP);
      const original = modeler.exportDSL();
      const water = shapeNamed('Water');

      for (let nudge = 0; nudge < 5; nudge++) {
        modeling().moveElements([water as unknown as Shape], { x: 0, y: 10 });
      }
      const nudged = modeler.exportDSL();
      expect(nudged).not.toBe(original);

      expectUndoRedoStable(original, nudged, 5);
    });

    it('after an attitude resize', async () => {
      await modeler.importDSL(ATTITUDE_MAP);
      const original = modeler.exportDSL();
      const attitude = firstOfType('attitude');

      modeling().resizeShape(attitude as unknown as Shape, {
        x: attitude.x,
        y: attitude.y,
        width: attitude.width - 40,
        height: attitude.height + 30,
      });
      const resized = modeler.exportDSL();
      expect(resized).not.toBe(original);

      expectUndoRedoStable(original, resized);
    });
  });

  describe('plot clamping', () => {
    it('clamps a drop outside the plot onto its edge and undoes to the original', async () => {
      await modeler.importDSL(TEA_SHOP);
      const original = modeler.exportDSL();
      const kettle = shapeNamed('Kettle');

      dragShape(kettle, { x: -500, y: 2000 });
      const clamped = modeler.exportDSL();
      expect(clamped).toContain('component Kettle [0, 0]');
      // Canvas and model agree: the node is drawn where the model says.
      expect(centerOf(kettle)).toEqual(grid().toCanvas({ evolution: 0, visibility: 0 }));

      expectUndoRedoStable(original, clamped);
      expect(centerOf(kettle)).toEqual(grid().toCanvas({ evolution: 0, visibility: 0 }));
    });

    it('keeps a moved selection together at the edge', async () => {
      await modeler.importDSL(TEA_SHOP);
      const kettle = shapeNamed('Kettle');
      const water = shapeNamed('Water');
      const distance = centerOf(water).x - centerOf(kettle).x;

      modeling().moveElements([kettle, water] as unknown as Shape[], { x: 900, y: 0 });

      expect(water.evolution).toBe(1);
      expect(centerOf(water).x - centerOf(kettle).x).toBeCloseTo(distance, 5);
    });

    it('keeps a whole attitude inside the plot when dragged past its corner', async () => {
      await modeler.importDSL(ATTITUDE_MAP);
      const original = modeler.exportDSL();
      const attitude = firstOfType('attitude');
      const { width, height } = attitude;

      dragShape(attitude, { x: 2000, y: 2000 });
      const clamped = modeler.exportDSL();
      expect(attitude.corner2).toEqual({ evolution: 1, visibility: 0 });
      expect(attitude.width).toBe(width);
      expect(attitude.height).toBe(height);

      expectUndoRedoStable(original, clamped);
    });

    it('keeps every point of a moved drawing inside the plot', async () => {
      await modeler.importDSL(`title Drawing Fixture
line [[0.5, 0.8], [0.4, 0.9], [0.3, 0.85]] (closed)`);
      const drawing = firstOfType('drawing');

      modeling().moveElements([drawing as unknown as Shape], { x: 400, y: 0 });

      const exported = modeler.exportMap().elements.find((element) => element.id === drawing.id);
      const points = exported && 'points' in exported ? exported.points : [];
      expect(Math.max(...points.map((point) => point.evolution))).toBe(1);
      // The shape survives a round trip unchanged: nothing was flattened at the edge.
      const absolute = (drawing.drawingPoints ?? []).map((point) => ({
        x: drawing.x + point.x,
        y: drawing.y + point.y,
      }));
      absolute.forEach((point, index) => {
        const projected = grid().toCanvas(points[index]!);
        expect(projected.x).toBeCloseTo(point.x, 5);
        expect(projected.y).toBeCloseTo(point.y, 5);
      });
    });
  });

  describe('pipelines', () => {
    it('renames the pipeline together with its anchor component, in one undo step', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const original = modeler.exportDSL();
      const kettle = shapeNamed('Kettle');
      modeler.get<WardleyModeling>('wardleyModeling').updateLabel(kettle, 'Boiler');

      expect(shapeNamed('Boiler', 'pipeline')).toBeDefined();
      const renamed = modeler.exportDSL();
      expect(renamed).toMatch(/^pipeline Boiler \[0\.25, 0\.92\]$/mu);
      expect(renamed).toContain('Boiler -> Power');
      modeler.undo();
      expect(modeler.exportDSL()).toBe(original);

      modeler
        .get<WardleyModeling>('wardleyModeling')
        .updateLabel(shapeNamed('Kettle', 'pipeline'), 'Kettles');
      expect(shapeNamed('Kettles').wardleyType).toBe('component');
    });

    it('lets a free component take the name of a pipeline without an anchor', async () => {
      await modeler.importDSL(`title Pairing
component Platform [0.6, 0.5]
component Water [0.4, 0.4]
pipeline Grid [0.3, 0.8]`);
      const factory = modeler.get<WardleyElementFactory>('wardleyElementFactory');
      const platform = shapeNamed('Platform');
      expect(factory.uniqueLabel('Grid', platform.id)).toBe('Grid');
      expect(factory.uniqueLabel('Water', platform.id)).toBe('Water 2');
      expect(factory.uniqueLabel('Platform', shapeNamed('Grid', 'pipeline').id)).toBe('Platform');

      modeler.get<WardleyModeling>('wardleyModeling').updateLabel(platform, 'Grid');
      expect(shapeNamed('Grid').wardleyType).toBe('component');
      expect(modeler.exportDSL()).toMatch(/^pipeline Grid \[0\.3, 0\.8\]/mu);
      // Once paired, the name is taken for everyone else.
      expect(factory.uniqueLabel('Grid', shapeNamed('Water').id)).toBe('Grid 2');
    });

    it('adopts a component dragged into a pipeline, and undo/redo restore both states', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const original = modeler.exportDSL();
      const pipeline = firstOfType('pipeline');
      const power = shapeNamed('Power');

      const target = { x: pipeline.x + pipeline.width * 0.45, y: pipeline.y + pipeline.height - 4 };
      const powerCenter = centerOf(power);
      const pipelineBox = () =>
        registry()
          .getGraphics(pipeline as unknown as Element)
          .querySelector('.djs-visual > rect')!;
      const idleDashes = getComputedStyle(pipelineBox()).strokeDasharray;
      let markedWhileDragging = false;
      let dashesWhileDragging = '';
      dragShape(
        power,
        { x: target.x - powerCenter.x, y: target.y - powerCenter.y },
        {
          beforeEnd: () => {
            markedWhileDragging = canvas().hasMarker(
              pipeline as unknown as Shape,
              DROP_TARGET_MARKER,
            );
            dashesWhileDragging = getComputedStyle(pipelineBox()).strokeDasharray;
          },
        },
      );

      expect(markedWhileDragging).toBe(true);
      // The marker must actually restyle the box (the renderer's inline styles win otherwise).
      expect(idleDashes).not.toBe('none');
      expect(dashesWhileDragging).toBe('none');
      expect(canvas().hasMarker(pipeline as unknown as Shape, DROP_TARGET_MARKER)).toBe(false);
      expect(power.pipelineId).toBe(pipeline.id);
      expect(centerOf(power).y).toBeCloseTo(pipeline.y + pipeline.height / 2, 5);
      const adopted = modeler.exportDSL();
      expect(adopted).toMatch(/\{\n(?:.*\n)*\s+component Power \[0\.\d+\]\n/);

      expectUndoRedoStable(original, adopted);
      expect(power.pipelineId).toBe(pipeline.id);
    });

    it('moves the members and the anchor component together with the pipeline box', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const original = modeler.exportDSL();
      const pipeline = firstOfType('pipeline');
      const campfire = shapeNamed('Campfire Kettle');
      const electric = shapeNamed('Electric Kettle');
      const anchor = shapeNamed('Kettle');

      dragShape(pipeline, plotDelta(0.03, 0.2), {
        beforeEnd: () => {
          // The preview carries the members too.
          expect(modeler.get<ManualDragging>('dragging').context()?.data.context.shapes).toEqual(
            expect.arrayContaining([pipeline, campfire, electric, anchor]),
          );
        },
      });

      expect(campfire.pipelineId).toBe(pipeline.id);
      expect(electric.pipelineId).toBe(pipeline.id);
      expect(campfire.visibility).toBe(pipeline.visibility);
      expect(anchor.visibility).toBeCloseTo(pipeline.visibility, 10);
      expect(pipeline.evolutionStart).toBeCloseTo(0.28, 2);
      expect(pipeline.evolutionEnd).toBeCloseTo(0.95, 2);
      expect(pipeline.visibility).toBeCloseTo(0.63, 2);
      expect(anchor.evolution).toBeCloseTo(0.63, 2);
      const moved = modeler.exportDSL();
      expect(moved).toMatch(/^pipeline Kettle \[[\d.]+, [\d.]+\]\n\{$/m);
      expect(moved).not.toContain('(y ');

      expectUndoRedoStable(original, moved);
    });

    it('carries the members on keyboard nudges of the pipeline', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const pipeline = firstOfType('pipeline');
      const campfire = shapeNamed('Campfire Kettle');
      const before = centerOf(campfire);

      modeling().moveElements([pipeline as unknown as Shape], { x: 10, y: -10 });

      expect(centerOf(campfire)).toEqual({ x: before.x + 10, y: before.y - 10 });
      expect(campfire.pipelineId).toBe(pipeline.id);
    });

    it('moves the pipeline vertically along with its anchor component', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const original = modeler.exportDSL();
      const pipeline = firstOfType('pipeline');
      const anchor = shapeNamed('Kettle');
      const campfire = shapeNamed('Campfire Kettle');
      const pipelineX = pipeline.x;

      dragShape(anchor, plotDelta(0.05, 0.15));

      expect(pipeline.x).toBe(pipelineX);
      expect(pipeline.y).toBeCloseTo(centerOf(anchor).y, 10);
      expect(centerOf(campfire).y).toBeCloseTo(pipeline.y + pipeline.height / 2, 10);
      expect(campfire.pipelineId).toBe(pipeline.id);
      expect(anchor.visibility).toBeCloseTo(0.58, 2);
      expect(anchor.evolution).toBeCloseTo(0.65, 2);
      const moved = modeler.exportDSL();
      expect(moved).not.toContain('(y ');

      expectUndoRedoStable(original, moved);
    });

    it('releases a member dragged out of the box', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const original = modeler.exportDSL();
      const campfire = shapeNamed('Campfire Kettle');

      dragShape(campfire, plotDelta(0, -0.2));

      expect(campfire.pipelineId).toBeUndefined();
      const released = modeler.exportDSL();
      expect(released).toMatch(/^component Campfire Kettle \[0\.2\d*, 0\.3\]$/m);

      expectUndoRedoStable(original, released);
    });

    it('only offers horizontal resize handles on a pipeline', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const pipeline = firstOfType('pipeline');

      modeler.get<Selection>('selection').select(pipeline as unknown as Element);

      const directions = [...container.querySelectorAll(`.djs-resizer-${pipeline.id}`)].map(
        (handle) =>
          [...handle.classList]
            .find((cls) => /^djs-resizer-(n|s|e|w|ne|nw|se|sw)$/.test(cls))
            ?.replace('djs-resizer-', ''),
      );
      expect(directions.sort()).toEqual(['e', 'w']);
    });

    it('keeps the pipeline height and the DSL when resized vertically', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const original = modeler.exportDSL();
      const pipeline = firstOfType('pipeline');
      const power = shapeNamed('Power');

      modeling().resizeShape(pipeline as unknown as Shape, {
        x: pipeline.x,
        y: pipeline.y + 0.4,
        width: pipeline.width,
        height: 180,
      });

      expect(pipeline.height).toBe(30);
      expect(power.pipelineId).toBeUndefined();
      expect(modeler.exportDSL()).toBe(original);
    });

    it('clamps a horizontal pipeline resize to the plot and keeps undo/redo exact', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const original = modeler.exportDSL();
      const pipeline = firstOfType('pipeline');
      const right = pipeline.x + pipeline.width;
      const plotLeft = grid().toCanvas({ evolution: 0, visibility: 0 }).x;

      modeling().resizeShape(pipeline as unknown as Shape, {
        x: plotLeft - 300,
        y: pipeline.y,
        width: right - plotLeft + 300,
        height: pipeline.height,
      });
      const resized = modeler.exportDSL();
      expect(pipeline.x).toBe(plotLeft);
      expect(resized).toMatch(/^pipeline Kettle \[0, 0\.92\]$/m);
      expect(resized).not.toContain('(y ');

      expectUndoRedoStable(original, resized);
    });

    it('releases members that fall outside a narrowed pipeline', async () => {
      await modeler.importDSL(PIPELINE_MAP);
      const pipeline = firstOfType('pipeline');
      const electric = shapeNamed('Electric Kettle');
      const campfire = shapeNamed('Campfire Kettle');

      modeling().resizeShape(pipeline as unknown as Shape, {
        x: pipeline.x,
        y: pipeline.y,
        width: pipeline.width / 2,
        height: pipeline.height,
      });

      expect(electric.pipelineId).toBeUndefined();
      expect(campfire.pipelineId).toBe(pipeline.id);
    });

    it('never nests a shape dropped onto another element', async () => {
      await modeler.importDSL(TEA_SHOP);
      const power = shapeNamed('Power');
      const water = shapeNamed('Water');
      const root = canvas().getRootElement();

      dragShape(
        power,
        { x: centerOf(water).x - centerOf(power).x, y: 0 },
        {
          hover: water as unknown as Element,
        },
      );

      expect(power.parent).toBe(root);
      expect(canvas().hasMarker(water as unknown as Shape, 'new-parent')).toBe(false);
    });

    it('never nests a shape created on top of another element', async () => {
      await modeler.importDSL(TEA_SHOP);
      const water = shapeNamed('Water');

      const created = modeling().createShape(
        {
          width: 34,
          height: 34,
          wardleyType: 'component',
          wardleyLabel: 'Tea',
          evolution: 0.5,
          visibility: 0.5,
        } as unknown as Shape,
        centerOf(water),
        water as unknown as Shape,
      );

      expect(created.parent).toBe(canvas().getRootElement());
    });
  });

  describe('drawings', () => {
    function drawAt(points: Point[], close = true): void {
      const drawTool = modeler.get<WardleyDrawTool>('wardleyDrawTool');
      drawTool.activate();
      const surface = canvas().getContainer();
      for (const point of [...points, ...(close ? [points[0]!] : [])]) {
        surface.dispatchEvent(mouseEvent('mousemove', point, { shiftKey: false }));
        surface.dispatchEvent(mouseEvent('mousedown', point, { shiftKey: false }));
      }
      if (!close) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }

    it('clamps drawn points into the plot, so the saved shape matches the canvas', async () => {
      await modeler.importDSL('title Draw Fixture');
      const rightEdge = grid().toCanvas({ evolution: 1, visibility: 0.5 }).x;
      const inside = grid().toCanvas({ evolution: 0.8, visibility: 0.5 });

      drawAt([
        { x: inside.x, y: inside.y - 40 },
        { x: rightEdge + 50, y: inside.y - 40 },
        { x: rightEdge + 50, y: inside.y + 40 },
        { x: inside.x, y: inside.y + 40 },
      ]);

      const drawing = firstOfType('drawing');
      const exported = modeler.exportMap().elements.find((element) => element.id === drawing.id);
      const points = exported && 'points' in exported ? exported.points : [];
      expect(points).toHaveLength(4);
      expect(Math.max(...points.map((point) => point.evolution))).toBe(1);
      (drawing.drawingPoints ?? []).forEach((point, index) => {
        const projected = grid().toCanvas(points[index]!);
        expect(projected.x).toBeCloseTo(drawing.x + point.x, 0);
        expect(projected.y).toBeCloseTo(drawing.y + point.y, 0);
      });
    });
  });

  describe('drawing vertex handles', () => {
    it('clamps a vertex dragged out of the plot', async () => {
      await modeler.importDSL(`title Drawing Fixture
line [[0.5, 0.8], [0.4, 0.9], [0.3, 0.85]] (closed)`);
      const drawing = firstOfType('drawing');
      modeler.get<Selection>('selection').select(drawing as unknown as Element);
      const handles = container.querySelectorAll('.wardley-drawing-handle');
      expect(handles).toHaveLength(3);
      const outside = grid().toCanvas({ evolution: 1, visibility: 0.4 });
      outside.x += 80;

      handles[1]!.dispatchEvent(mouseEvent('mousedown', { x: 0, y: 0 }, { shiftKey: false }));
      document.dispatchEvent(mouseEvent('mousemove', outside, { shiftKey: false }));
      document.dispatchEvent(mouseEvent('mouseup', outside, { shiftKey: false }));

      const exported = modeler.exportMap().elements.find((element) => element.id === drawing.id);
      const points = exported && 'points' in exported ? exported.points : [];
      expect(points[1]!.evolution).toBe(1);
      const vertex = drawing.drawingPoints![1]!;
      const projected = grid().toCanvas(points[1]!);
      expect(drawing.x + vertex.x).toBeCloseTo(projected.x, 5);
      expect(drawing.y + vertex.y).toBeCloseTo(projected.y, 5);
    });
  });

  describe('evolve', () => {
    it('cannot drag the evolve target behind the component', async () => {
      await modeler.importDSL(EVOLVE_MAP);
      const original = modeler.exportDSL();
      const kettle = shapeNamed('Kettle');
      const dragging = modeler.get<ManualDragging>('dragging');
      dragging.setOptions({ manual: true });

      const start = centerOf(kettle);
      modeler
        .get<WardleyEvolveDragging>('wardleyEvolveDragging')
        .start(mouseEvent('mousedown', start), kettle);
      dragging.move(mouseEvent('mousemove', { x: start.x - 20, y: start.y }), true);
      dragging.move(mouseEvent('mousemove', { x: start.x - 120, y: start.y }));

      expect(kettle.movement?.targetEvolution).toBeGreaterThan(kettle.evolution);
      dragging.end();
      expect(modeler.exportDSL()).toBe(original);
    });

    it('stops the direct target handle at the component as well', async () => {
      await modeler.importDSL(EVOLVE_MAP);
      const kettle = shapeNamed('Kettle');
      const handle = registry().getGraphics(kettle).querySelector('.wardley-evolve-handle');
      if (!handle) throw new Error('evolve handle missing');
      const target = grid().toCanvas({ evolution: 0.85, visibility: kettle.visibility });

      handle.dispatchEvent(mouseEvent('mousedown', target, { shiftKey: false }));
      const behind = { x: centerOf(kettle).x - 150, y: target.y };
      document.dispatchEvent(mouseEvent('mousemove', behind, { shiftKey: false }));

      expect(kettle.movement?.targetEvolution).toBeGreaterThan(kettle.evolution);
      document.dispatchEvent(mouseEvent('mouseup', behind, { shiftKey: false }));
      expect(kettle.movement?.targetEvolution).toBe(0.85);
    });

    it('keeps the new name, method and label offset when the target handle is dragged', async () => {
      await modeler.importDSL(`title Evolve Fixture
component Kettle [0.35, 0.43]
evolve Kettle->Electric Kettle 0.6 (buy) label [10, 20]`);
      const original = modeler.exportDSL();
      const kettle = shapeNamed('Kettle');
      const handle = registry().getGraphics(kettle).querySelector('.wardley-evolve-handle');
      if (!handle) throw new Error('evolve handle missing');
      const start = grid().toCanvas({ evolution: 0.6, visibility: kettle.visibility });
      const end = { x: start.x + plotDelta(0.1, 0).x, y: start.y };

      handle.dispatchEvent(mouseEvent('mousedown', start, { shiftKey: false }));
      document.dispatchEvent(mouseEvent('mousemove', end, { shiftKey: false }));
      expect(kettle.movement).toMatchObject({ newLabel: 'Electric Kettle', method: 'buy' });
      document.dispatchEvent(mouseEvent('mouseup', end, { shiftKey: false }));

      expect(kettle.movement?.targetEvolution).toBeGreaterThan(0.65);
      expect(modeler.exportDSL()).toMatch(
        /evolve Kettle->Electric Kettle 0\.\d+ \(buy\) label \[10, 20\]/u,
      );
      modeler.undo();
      expect(modeler.exportDSL()).toBe(original);
    });

    it('keeps the evolve details when the context-pad drag moves the target', async () => {
      await modeler.importDSL(`title Evolve Fixture
component Kettle [0.35, 0.43]
evolve Kettle->Electric Kettle 0.6 label [10, 20]`);
      const kettle = shapeNamed('Kettle');
      const dragging = modeler.get<ManualDragging>('dragging');
      dragging.setOptions({ manual: true });
      const start = grid().toCanvas({ evolution: 0.6, visibility: kettle.visibility });

      modeler
        .get<WardleyEvolveDragging>('wardleyEvolveDragging')
        .start(mouseEvent('mousedown', start), kettle);
      dragging.move(mouseEvent('mousemove', { x: start.x + 20, y: start.y }), true);
      dragging.move(mouseEvent('mousemove', { x: start.x + plotDelta(0.1, 0).x, y: start.y }));
      expect(kettle.movement?.labelOffset).toEqual({ dx: 10, dy: 20 });
      dragging.end();

      expect(kettle.movement?.targetEvolution).toBeGreaterThan(0.65);
      expect(modeler.exportDSL()).toMatch(
        /evolve Kettle->Electric Kettle 0\.\d+ label \[10, 20\]/u,
      );
    });

    it('leaves the evolve target alone while the draw tool is active', async () => {
      await modeler.importDSL(EVOLVE_MAP);
      const kettle = shapeNamed('Kettle');
      const handle = registry().getGraphics(kettle).querySelector('.wardley-evolve-handle');
      if (!handle) throw new Error('evolve handle missing');
      modeler.get<WardleyDrawTool>('wardleyDrawTool').activate();
      const start = grid().toCanvas({ evolution: 0.85, visibility: kettle.visibility });
      const end = { x: start.x - plotDelta(0.2, 0).x, y: start.y };

      handle.dispatchEvent(mouseEvent('mousedown', start, { shiftKey: false }));
      document.dispatchEvent(mouseEvent('mousemove', end, { shiftKey: false }));
      document.dispatchEvent(mouseEvent('mouseup', end, { shiftKey: false }));

      expect(kettle.movement?.targetEvolution).toBe(0.85);
      modeler.get<WardleyDrawTool>('wardleyDrawTool').cancel();
    });

    it('shifts the target when the component is moved past it, undoably', async () => {
      await modeler.importDSL(EVOLVE_MAP);
      const original = modeler.exportDSL();
      const kettle = shapeNamed('Kettle');

      dragShape(kettle, plotDelta(0.47, 0));

      expect(kettle.evolution).toBeCloseTo(0.9, 2);
      expect(kettle.movement?.targetEvolution).toBe(1);
      const moved = modeler.exportDSL();
      expect(moved).toContain('evolve Kettle 1');

      expectUndoRedoStable(original, moved);
    });

    it('keeps the planned distance when moved past the target', async () => {
      await modeler.importDSL(`title Evolve Fixture
component Kettle [0.35, 0.43]
evolve Kettle 0.55`);
      const kettle = shapeNamed('Kettle');

      modeling().moveElements([kettle as unknown as Shape], plotDelta(0.2, 0));

      expect(kettle.evolution).toBeCloseTo(0.63, 2);
      expect(kettle.movement!.targetEvolution - kettle.evolution).toBeCloseTo(0.12, 2);
    });

    it('clears the movement when the component reaches the right edge', async () => {
      await modeler.importDSL(EVOLVE_MAP);
      const kettle = shapeNamed('Kettle');

      modeling().moveElements([kettle as unknown as Shape], plotDelta(0.8, 0));

      expect(kettle.evolution).toBe(1);
      expect(kettle.movement).toBeUndefined();
      expect(modeler.exportDSL()).not.toContain('evolve');
      modeler.undo();
      expect(kettle.movement?.targetEvolution).toBe(0.85);
    });

    it('keeps an absolute target the component does not reach', async () => {
      await modeler.importDSL(EVOLVE_MAP);
      const kettle = shapeNamed('Kettle');

      modeling().moveElements([kettle as unknown as Shape], plotDelta(0.2, 0));

      expect(kettle.movement?.targetEvolution).toBe(0.85);
    });
  });
});
