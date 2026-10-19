import { afterEach, describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Move from 'diagram-js/lib/features/move/Move';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import { Modeler } from '../../src/index.js';
import '../../src/assets/wardley.css';

describe('import lifecycle', () => {
  let host: HTMLDivElement | undefined;
  let modeler: Modeler | undefined;

  afterEach(() => {
    modeler?.destroy();
    host?.remove();
    modeler = undefined;
    host = undefined;
  });

  function createModeler(): Modeler {
    host = document.createElement('div');
    host.style.width = '1200px';
    host.style.height = '800px';
    document.body.appendChild(host);
    modeler = new Modeler({ container: host });
    return modeler;
  }

  it('imports after the canvas root was read before the first import', async () => {
    const editor = createModeler();
    editor.get<Canvas>('canvas').getRootElement();
    editor.get<Canvas>('canvas').viewbox();

    await editor.importDSL('title Early\ncomponent A [0.5, 0.5]');

    expect(editor.exportMap().elements.map((element) => element.label)).toEqual(['A']);
    expect(editor.exportDSL()).toContain('component A [0.5, 0.5]');
  });

  it('imports after zooming before the first import', async () => {
    const editor = createModeler();
    editor.get<Canvas>('canvas').zoom(1.5);

    await editor.importDSL('title Early\ncomponent B [0.4, 0.6]');

    expect(editor.exportMap().elements.map((element) => element.label)).toEqual(['B']);
  });

  it('keeps writing edits back after a re-import that arrives during a drag', async () => {
    const editor = createModeler();
    await editor.importDSL('title X\ncomponent A [0.5, 0.5]\ncomponent B [0.3, 0.3]\nA -> B');
    const registry = editor.get<ElementRegistry>('elementRegistry');
    const canvas = editor.get<Canvas>('canvas');
    const shapeB = registry.get('cmp_b') as Shape;
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    const client = (x: number, y: number) => ({
      clientX: rect.left + (x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (y - viewbox.y) * viewbox.scale,
    });
    const start = { x: shapeB.x + shapeB.width / 2, y: shapeB.y + shapeB.height / 2 };
    const mousedown = new MouseEvent('mousedown', {
      ...client(start.x, start.y),
      bubbles: true,
      button: 0,
    });
    Object.defineProperty(mousedown, 'target', {
      value: registry.getGraphics(shapeB as Element),
    });
    editor.get<Move>('move').start(mousedown, shapeB, true);
    const move = (dx: number) =>
      document.dispatchEvent(
        new MouseEvent('mousemove', { ...client(start.x + dx, start.y), bubbles: true }),
      );
    move(20);
    move(40);

    await editor.importDSL(
      'title X\ncomponent A [0.5, 0.5]\ncomponent B [0.3, 0.3]\ncomponent C [0.6, 0.6]\nA -> B',
    );
    move(60);
    document.dispatchEvent(
      new MouseEvent('mouseup', { ...client(start.x + 60, start.y), bubbles: true }),
    );

    let changes = 0;
    editor.on('commandStack.changed', () => changes++);
    editor
      .get<{ moveElements(shapes: Shape[], delta: { x: number; y: number }): void }>('modeling')
      .moveElements([registry.get('cmp_a') as Shape], { x: 30, y: 0 });
    expect(changes).toBe(1);
    expect(editor.exportMap().elements.map((element) => element.label)).toEqual(['A', 'B', 'C']);
  });

  describe('a rejected import leaves no trace', () => {
    const MAP = 'title Before\ncomponent A [0.5, 0.5]\ncomponent B [0.3, 0.3]\nA -> B';

    async function withHistory(): Promise<{ editor: Modeler; edited: string }> {
      const editor = createModeler();
      await editor.importDSL(MAP);
      editor.setTitle('Edited');
      return { editor, edited: editor.exportDSL() };
    }

    it('rejects an invalid map before touching the canvas or the undo history', async () => {
      const { editor, edited } = await withHistory();
      const invalid = {
        ...editor.exportMap(),
        edges: [{ id: 'e', edgeType: 'dependency', from: 'x', to: 'y' }],
      };
      await expect(editor.importMap(invalid as never)).rejects.toThrow();
      expect(editor.exportDSL()).toBe(edited);
      editor.undo();
      expect(editor.exportDSL()).toContain('title Before');
    });

    it('rejects ids the canvas reserves for itself', async () => {
      const { editor, edited } = await withHistory();
      const map = editor.exportMap();
      const [first, ...rest] = map.elements;
      await expect(
        editor.importMap({
          ...map,
          elements: [{ ...first!, id: 'wardley-root' }, ...rest],
          edges: [],
        }),
      ).rejects.toThrow(/reserved/);
      expect(editor.exportDSL()).toBe(edited);
    });

    it('puts the previous map back when rendering fails half-way', async () => {
      const { editor, edited } = await withHistory();
      const factory = editor.get<{ createFromModel(element: unknown): unknown }>(
        'wardleyElementFactory',
      );
      const createFromModel = factory.createFromModel.bind(factory);
      factory.createFromModel = (element: unknown) => {
        if ((element as { label?: string }).label === 'Broken') throw new Error('render failed');
        return createFromModel(element);
      };
      await expect(editor.importDSL('title Next\ncomponent Broken [0.5, 0.5]')).rejects.toThrow(
        'render failed',
      );
      factory.createFromModel = createFromModel;
      expect(editor.exportDSL()).toBe(edited);
      expect(editor.get<ElementRegistry>('elementRegistry').get('cmp_a')).toBeDefined();
    });
  });
});
