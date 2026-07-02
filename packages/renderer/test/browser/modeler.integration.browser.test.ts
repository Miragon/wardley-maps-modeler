import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import { Modeler } from '../../src/index.js';
import { isWardleyShape, type WardleyShape } from '../../src/model/di-types.js';
// Pull the real stylesheet in so layout (getBBox) matches production. src/index.ts also imports it.
import '../../src/assets/wardley.css';

// Minimal OWM map: an anchor depending on a component. DSL coords are [visibility, evolution].
const DSL = `title Integration Fixture
anchor Customer [0.95, 0.45]
component Platform [0.55, 0.62]
Customer -> Platform`;

function findByLabel(registry: ElementRegistry, label: string): WardleyShape {
  const shape = registry.find((el) => isWardleyShape(el) && el.wardleyLabel === label) as
    WardleyShape | undefined;
  if (!shape) throw new Error(`shape not found: ${label}`);
  return shape;
}

describe('Modeler integration (real browser DOM)', () => {
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

  it('imports a DSL map into the elementRegistry with real SVG layout', async () => {
    const { warnings } = await modeler.importDSL(DSL);
    expect(warnings).toEqual([]);

    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const labels = registry
      .filter(
        (el) =>
          isWardleyShape(el) && (el.wardleyType === 'component' || el.wardleyType === 'anchor'),
      )
      .map((el) => (el as WardleyShape).wardleyLabel)
      .sort();
    expect(labels).toEqual(['Customer', 'Platform']);

    // Browser-only invariant: a real getBBox() yields a non-zero box. jsdom returns 0×0, so this is
    // exactly why the integration layer needs Browser Mode.
    const gfx = registry.getGraphics(findByLabel(registry, 'Platform')) as SVGGraphicsElement;
    const box = gfx.getBBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  it('roundtrips importDSL -> exportMap with stable labels and positions', async () => {
    await modeler.importDSL(DSL);
    const map = modeler.exportMap();

    expect(map.elements.map((e) => e.label).sort()).toEqual(['Customer', 'Platform']);
    expect(map.edges).toHaveLength(1);

    const platform = map.elements.find((e) => e.label === 'Platform');
    expect(platform?.position.evolution).toBeCloseTo(0.62, 2);
    expect(platform?.position.visibility).toBeCloseTo(0.55, 2);

    // saveSVG() depends on real layout — smoke-assert it serializes.
    const { svg } = await modeler.saveSVG();
    expect(svg).toContain('<svg');
  });

  it('re-projects normalized coords on move and restores them on undo', async () => {
    await modeler.importDSL(DSL);
    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const modeling = modeler.get<Modeling>('modeling');
    const commandStack = modeler.get<CommandStack>('commandStack');

    const platform = findByLabel(registry, 'Platform');
    const before = {
      evolution: platform.evolution,
      visibility: platform.visibility,
      x: platform.x,
    };

    // Drive the public modeling API (deterministic) — not a synthetic drag. Moving right increases
    // evolution; EvolutionConstraintBehavior re-projects the normalized coords from the new geometry.
    modeling.moveShape(platform, { x: 120, y: 0 });
    const movedX = platform.x;
    expect(platform.evolution).toBeGreaterThan(before.evolution);
    expect(platform.evolution).toBeLessThanOrEqual(1);
    expect(platform.visibility).toBeCloseTo(before.visibility, 5);
    expect(commandStack.canUndo()).toBe(true);

    // Undo restores both the pixel geometry and the re-projected normalized coordinate.
    modeler.undo();
    expect(platform.x).toBeCloseTo(before.x, 1);
    expect(platform.evolution).toBeCloseTo(before.evolution, 5);
    expect(modeler.canRedo()).toBe(true);

    // Redo re-applies the move geometry.
    modeler.redo();
    expect(platform.x).toBeCloseTo(movedX, 1);
    expect(modeler.canUndo()).toBe(true);
  });
});
