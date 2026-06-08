import { test, expect, type Page } from '@playwright/test';

/**
 * Typed handle to the app's debug surface (exposed in apps/webapp/src/main.ts). We never import the
 * renderer here — only the structural shape we call into. Kept minimal so @miragon/wardley-e2e stays
 * free of @miragon/wardley-* dependencies.
 */
interface WardleyViewer {
  importDSL(text: string): Promise<unknown>;
  exportMap(): {
    config: { title?: string };
    elements: ReadonlyArray<{ label: string }>;
    edges: ReadonlyArray<unknown>;
  };
  exportDSL(): string;
  saveSVG(): Promise<{ svg: string }>;
}
declare global {
  interface Window {
    __wardleyViewer: WardleyViewer;
  }
}

async function waitForViewer(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__wardleyViewer !== 'undefined');
}

test.describe('webapp export round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
  });

  test('loads the Tea Shop example and exports stable DSL + SVG', async ({ page }) => {
    // Real UI: the app starts on an empty canvas; load the example via the floating menu.
    await page.locator('#btn-menu').click();
    await page.locator('#m-example').click();

    // The renderer paints one .djs-element per node/edge once import.done fires.
    await expect(page.locator('#canvas .djs-element').first()).toBeVisible();

    const map = await page.evaluate(() => window.__wardleyViewer.exportMap());
    expect(map.elements.length).toBeGreaterThan(0);
    expect(map.edges.length).toBeGreaterThan(0);
    expect(map.config.title).toBe('Tea Shop');

    const labels = map.elements.map((element) => element.label);
    expect(labels).toContain('Cup of Tea');
    expect(labels).toContain('Kettle');

    const dsl = await page.evaluate(() => window.__wardleyViewer.exportDSL());
    expect(dsl).toContain('title Tea Shop');
    expect(dsl).toMatch(/component Kettle \[/);

    const { svg } = await page.evaluate(() => window.__wardleyViewer.saveSVG());
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
