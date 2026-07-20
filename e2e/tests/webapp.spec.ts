import { test, expect } from '@playwright/test';
import {
  connectShapes,
  createComponentAt,
  dragShape,
  dropAt,
  elementGfx,
  exportDSL,
  exportMap,
  exportSvg,
  renameShape,
  selectShape,
  settleForSnapshot,
  startNewMap,
  waitForViewer,
} from './support/viewer.js';

/**
 * End-to-end coverage for the webapp. Two groups:
 *  - "export round-trip": import/export correctness (DSL round-trip, SVG, Tea Shop render).
 *  - "modelling interactions": drive the real tool (palette, context pad, inline editing, keyboard)
 *    and assert the result through the `window.__wardleyViewer` debug surface.
 * All tests are independent and share no state.
 */

test.describe('webapp export round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
  });

  test('loads the Tea Shop example and exports stable DSL + SVG', async ({ page }) => {
    // Real UI: the app opens on the landing (empty canvas), which hides the working chrome and
    // offers a start card — load the example from its "Show example" button.
    await page.locator('#btn-example').click();

    // The renderer paints one .djs-element per node/edge once import.done fires.
    await expect(page.locator('#canvas .djs-element').first()).toBeVisible();

    const map = await exportMap(page);
    expect(map.elements.length).toBeGreaterThan(0);
    expect(map.edges.length).toBeGreaterThan(0);
    expect(map.config.title).toBe('Tea Shop');

    const labels = map.elements.map((element) => element.label);
    expect(labels).toContain('Cup of Tea');
    expect(labels).toContain('Kettle');

    const dsl = await exportDSL(page);
    expect(dsl).toContain('title Tea Shop');
    expect(dsl).toMatch(/component Kettle \[/);

    const svg = await exportSvg(page);
    expect(svg).toContain('<svg');
  });

  test('import -> export -> re-import is a lossless DSL fixed point', async ({ page }) => {
    const source = [
      'title Round Trip',
      'component A [0.20, 0.80]',
      'component B [0.60, 0.40]',
      'A -> B',
    ].join('\n');

    const result = await page.evaluate(async (dsl) => {
      const viewer = window.__wardleyViewer;
      await viewer.importDSL(dsl);
      const first = viewer.exportDSL();
      await viewer.importDSL(first); // round-trip
      return { first, second: viewer.exportDSL(), map: viewer.exportMap() };
    }, source);

    expect(result.map.elements.map((element) => element.label).sort()).toEqual(['A', 'B']);
    expect(result.map.edges).toHaveLength(1);
    // Round-trip stability: re-serializing the serialized form is a fixed point.
    expect(result.second).toBe(result.first);
    expect(result.first).toContain('title Round Trip');
  });
});

test.describe('webapp modelling interactions', () => {
  test.beforeEach(async ({ page }) => {
    await startNewMap(page);
  });

  test('creates a component from the palette', async ({ page }) => {
    const id = await createComponentAt(page, 0.45, 0.5);

    const map = await exportMap(page);
    expect(map.elements.map((element) => element.label)).toEqual(['Component']);
    expect(map.elements[0]?.elementType).toBe('component');
    await expect(elementGfx(page, id)).toBeVisible();
  });

  test('moves a component and re-projects its coordinates', async ({ page }) => {
    const id = await createComponentAt(page, 0.4, 0.5);
    const before = (await exportMap(page)).elements[0]!.position;

    // Drag right along the evolution axis; EvolutionConstraintBehavior re-projects the model coords.
    await dragShape(page, id, 0.7, 0.5);

    const after = (await exportMap(page)).elements[0]!.position;
    expect(after.evolution).toBeGreaterThan(before.evolution);
    expect(after.visibility).toBeCloseTo(before.visibility, 1);
  });

  test('creates a dependency between two components', async ({ page }) => {
    const source = await createComponentAt(page, 0.35, 0.4);
    const target = await createComponentAt(page, 0.65, 0.6);

    await connectShapes(page, source, target);

    const map = await exportMap(page);
    expect(map.edges).toHaveLength(1);
    const edge = map.edges[0]!;
    expect(edge.edgeType).toBe('dependency');
    expect([edge.from, edge.to].sort()).toEqual([source, target].sort());
  });

  test('renames a component inline and the new label survives a round-trip', async ({ page }) => {
    const id = await createComponentAt(page, 0.45, 0.5);

    await renameShape(page, id, 'Kettle');
    expect((await exportMap(page)).elements.map((element) => element.label)).toEqual(['Kettle']);

    // Export -> re-import: the renamed label is stable.
    const dsl = await exportDSL(page);
    expect(dsl).toMatch(/component Kettle \[/);
    await page.evaluate((text) => window.__wardleyViewer.importDSL(text), dsl);
    expect((await exportMap(page)).elements.map((element) => element.label)).toEqual(['Kettle']);
  });

  test('deletes a component', async ({ page }) => {
    const id = await createComponentAt(page, 0.45, 0.5);
    await selectShape(page, id);

    await page.keyboard.press('Delete');

    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(0);
    await expect(elementGfx(page, id)).toHaveCount(0);
  });

  test('copies and pastes a component (labels stay unique)', async ({ page }) => {
    const id = await createComponentAt(page, 0.4, 0.5);
    await selectShape(page, id);

    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    // Paste attaches the clone to the cursor (like palette create) — drop it at a new spot.
    await dropAt(page, 0.65, 0.6);

    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(2);
    const labels = (await exportMap(page)).elements.map((element) => element.label).sort();
    expect(labels).toEqual(['Component', 'Component 2']);
  });

  test('builds a map through the UI and exports an SVG matching the snapshot', async ({ page }) => {
    const source = await createComponentAt(page, 0.35, 0.4);
    const target = await createComponentAt(page, 0.65, 0.6);
    await connectShapes(page, source, target);
    await settleForSnapshot(page);

    const svg = await exportSvg(page);
    expect(svg).toContain('<svg');
    expect(svg).toMatchSnapshot('modelling-map.svg');
  });
});
