import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import { parseDSLWithDiagnostics, serializeDSL } from '@miragon/wardley-dsl';
import { COLORS, type EvolutionGrid, Modeler, blobToBase64, svgToPng } from '../../src/index.js';
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyShape,
} from '../../src/model/di-types.js';
// Pull the real stylesheet in so layout (getBBox) matches production. src/index.ts also imports it.
import '../../src/assets/wardley.css';

function findByLabel(registry: ElementRegistry, label: string): WardleyShape {
  const shape = registry.find((el) => isWardleyShape(el) && el.wardleyLabel === label) as
    WardleyShape | undefined;
  if (!shape) throw new Error(`shape not found: ${label}`);
  return shape;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function exportedViewBox(svg: string): Box {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const [x, y, width, height] = (root.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  expect(Number(root.getAttribute('width'))).toBe(width);
  expect(Number(root.getAttribute('height'))).toBe(height);
  return { x: x!, y: y!, width: width!, height: height! };
}

/** The drawn box of a shape (glyph + label) in diagram coordinates. */
function drawnBox(registry: ElementRegistry, shape: WardleyShape): Box {
  // The element group carries the translate(x, y); getBBox is in its own, untransformed space.
  const local = (registry.getGraphics(shape) as SVGGraphicsElement).getBBox();
  return { x: shape.x + local.x, y: shape.y + local.y, width: local.width, height: local.height };
}

function expectInside(inner: Box, outer: Box): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
}

function changedLines(before: string, after: string): number {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  expect(afterLines).toHaveLength(beforeLines.length);
  return beforeLines.filter((line, index) => line !== afterLines[index]).length;
}

async function pixelAt(png: Blob, x: number, y: number): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(png);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(x, y, 1, 1).data;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Deliberately NOT in serializer order (attitudes, pipelines, notes and lines are mixed in between
// the components), with interleaved flows and dependencies.
const NON_CANONICAL_DSL = `title Source order fixture
annotations [0.97, 0.03]
anchor Business [0.95, 0.63] label [-30, -8]
note Standardising power allows Kettles to evolve faster [0.3, 0.49]
anchor Public [0.95, 0.78]
component Cup of Tea [0.79, 0.61] label [19, -4]
pioneers [0.6, 0.05, 0.45, 0.25]
component Tea [0.63, 0.81] label [-63, 4] (inertia)
component Hot Water [0.52, 0.8] label [5, 8]
component Kettle [0.43, 0.35] label [-57, 4]
component Power [0.1, 0.7] label [-27, 20]
line [[0.9, 0.1], [0.85, 0.2], [0.88, 0.33]] (dashed) (color #C92A2A)
component Water [0.38, 0.82] (buy)
pipeline Kettle [0.23, 0.68] {
  component Electric Kettle [0.45] label [10, 6]
  component Smart Kettle [0.29]
}
pipeline Brewing [0.15, 0.55] (y 0.24)
evolve Kettle 0.62 label [16, 5]
evolve Power 0.89 (buy)
townplanners [0.3, 0.8, 0.15, 0.97]
accelerator Open source [0.33, 0.12]
deaccelerator Regulation [0.2, 0.3]
submap Payments [0.55, 0.45] url(paymentsMap)
url paymentsMap [https://example.com/payments]
note Hot water is obvious [0.66, 0.91] (color #0B7A55)
annotation 1 [[0.43, 0.49], [0.08, 0.79]] Standardising power
annotation 2 [0.48, 0.85] Hot water is obvious
line [[0.1, 0.1], [0.1, 0.22], [0.02, 0.22]] (closed)
Business -> Cup of Tea
Public +'$4'> Cup of Tea
Cup of Tea -> Tea
Cup of Tea -> Hot Water; served hot
Hot Water +> Water
Hot Water -> Kettle
Kettle -> Power
Electric Kettle -> Power`;

describe('io: export bounds, source order, connection z-order (real browser DOM)', () => {
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

  describe('SVG export bounds', () => {
    it('keeps a long commodity label and a label pushed left of the plot inside the export', async () => {
      await modeler.importDSL(`title Overflow
component Content Delivery Network Service [0.5, 0.97]
component Cloud Compute [0.08, 0.94]
component Ideation Workshop [0.6, 0.01] label [-220, 0]`);
      const registry = modeler.get<ElementRegistry>('elementRegistry');
      const outer = modeler.get<EvolutionGrid>('evolutionGrid').outerBounds();
      const commodity = drawnBox(
        registry,
        findByLabel(registry, 'Content Delivery Network Service'),
      );
      const genesis = drawnBox(registry, findByLabel(registry, 'Ideation Workshop'));
      // Preconditions: both labels really overflow the plot frame the export used to be cut to.
      expect(commodity.x + commodity.width).toBeGreaterThan(outer.x + outer.width);
      expect(genesis.x).toBeLessThan(outer.x);

      const viewBox = exportedViewBox((await modeler.saveSVG()).svg);

      expectInside(commodity, viewBox);
      expectInside(genesis, viewBox);
      expectInside(drawnBox(registry, findByLabel(registry, 'Cloud Compute')), viewBox);
      expectInside(outer, viewBox);
      for (const value of Object.values(viewBox)) expect(Number.isInteger(value)).toBe(true);
    });

    it('keeps custom axis labels that run past the plot margins inside the export', async () => {
      await modeler.importDSL(`title Axis
y-axis Value Chain->Hidden from the user entirely->Highly visible to customers
component Platform [0.5, 0.5]`);
      const layer = modeler
        .get<Canvas>('canvas')
        .getContainer()
        .querySelector<SVGGraphicsElement>('.layer-wardley-axes')!;
      const axes = layer.getBBox();
      const outer = modeler.get<EvolutionGrid>('evolutionGrid').outerBounds();
      expect(axes.x).toBeLessThan(outer.x);

      const viewBox = exportedViewBox((await modeler.saveSVG()).svg);
      expectInside({ x: axes.x, y: axes.y, width: axes.width, height: axes.height }, viewBox);
    });

    it('exports exactly the plot frame when nothing overflows it', async () => {
      await modeler.importDSL(`title Centred
component Platform [0.5, 0.5]`);
      const outer = modeler.get<EvolutionGrid>('evolutionGrid').outerBounds();
      expect(exportedViewBox((await modeler.saveSVG()).svg)).toEqual(outer);
    });

    it('exports the plot frame of an empty map', async () => {
      await modeler.importDSL('title Empty');
      const outer = modeler.get<EvolutionGrid>('evolutionGrid').outerBounds();
      expect(exportedViewBox((await modeler.saveSVG()).svg)).toEqual(outer);
    });

    it('ignores the current pan and zoom', async () => {
      await modeler.importDSL(`title Zoomed
component Content Delivery Network Service [0.5, 0.97]`);
      const before = exportedViewBox((await modeler.saveSVG()).svg);
      const canvas = modeler.get<Canvas>('canvas');
      canvas.zoom(2.5);
      canvas.scroll({ dx: -300, dy: 120 });
      const after = exportedViewBox((await modeler.saveSVG()).svg);
      expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
      // Text hinting differs slightly between zoom levels (seen on Linux Chromium), which moves
      // the measured label end by a pixel or two; the export must not follow the viewport.
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(4);
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(4);
    });
  });

  describe('the exported svg element', () => {
    it('is the canvas itself, also when a host chrome puts icons in front of it', async () => {
      await modeler.importDSL(`title Chrome
component Platform [0.5, 0.5]`);
      const canvasContainer = modeler.get<Canvas>('canvas').getContainer();
      const palette = document.createElement('div');
      palette.innerHTML = '<svg class="palette-icon" width="20" height="20"></svg>';
      canvasContainer.insertBefore(palette, canvasContainer.firstChild);

      const root = new DOMParser().parseFromString(
        (await modeler.saveSVG()).svg,
        'image/svg+xml',
      ).documentElement;

      expect(root.getAttribute('class') ?? '').not.toContain('palette-icon');
      expect(root.querySelector('.layer-wardley-axes')).not.toBeNull();
      for (const attribute of ['tabindex', 'role', 'aria-label', 'aria-roledescription']) {
        expect(root.hasAttribute(attribute), attribute).toBe(false);
      }
      palette.remove();
    });
  });

  describe('selection in the export', () => {
    it('exports the same picture whether or not something is selected or hovered', async () => {
      await modeler.importDSL(`title Selection
component Kettle [0.43, 0.35]
component Power [0.1, 0.7]
line [[0.2, 0.2], [0.3, 0.3]]
Kettle -> Power`);
      const selection = modeler.get<Selection>('selection');
      const plain = (await modeler.saveSVG()).svg;

      const all = modeler
        .get<ElementRegistry>('elementRegistry')
        .filter((element) => element.id !== '__implicitroot' && !!element.parent);
      selection.select(all);
      modeler.get<Canvas>('canvas').addMarker(all[0]!.id, 'hover');
      const { svg } = await modeler.saveSVG();

      expect(selection.get()).toHaveLength(all.length);
      expect(svg).not.toMatch(/class="[^"]*\b(selected|hover)\b/u);
      expect(svg).not.toContain('wardley-drawing-handle');
      expect(svg).toBe(plain);
    });
  });

  describe('PNG rasterizer', () => {
    it('rasterizes at the requested scale with a paper background', async () => {
      await modeler.importDSL(`title PNG
component Content Delivery Network Service [0.5, 0.97]`);
      const { svg } = await modeler.saveSVG();
      const viewBox = exportedViewBox(svg);

      const png = await svgToPng(svg);
      expect(png.type).toBe('image/png');
      const bitmap = await createImageBitmap(png);
      expect(bitmap.width).toBe(viewBox.width * 2);
      expect(bitmap.height).toBe(viewBox.height * 2);

      const [red, green, blue, alpha] = await pixelAt(png, 1, 1);
      expect([red, green, blue]).toEqual(hexToRgb(COLORS.paper));
      expect(alpha).toBe(255);
    });

    it('leaves the background transparent on request and honours the scale', async () => {
      await modeler.importDSL(`title PNG
component Platform [0.5, 0.5]`);
      const { svg } = await modeler.saveSVG();
      const viewBox = exportedViewBox(svg);

      const png = await svgToPng(svg, { scale: 4, transparent: true });
      const bitmap = await createImageBitmap(png);
      expect(bitmap.width).toBe(viewBox.width * 4);
      expect(bitmap.height).toBe(viewBox.height * 4);
      expect((await pixelAt(png, 1, 1))[3]).toBe(0);
    });

    it('sizes by the root element, not by the first nested width attribute', async () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="100%">' +
        '<rect width="7" height="5" fill="red"/></svg>';
      const bitmap = await createImageBitmap(await svgToPng(svg, { scale: 1 }));
      expect([bitmap.width, bitmap.height]).toEqual([30, 20]);
    });

    it('rejects a non-positive scale', async () => {
      await expect(
        svgToPng('<svg xmlns="http://www.w3.org/2000/svg"/>', { scale: 0 }),
      ).rejects.toThrow(RangeError);
    });

    it('encodes a blob as base64 without the data-URL prefix', async () => {
      const base64 = await blobToBase64(new Blob(['wardley'], { type: 'text/plain' }));
      expect(base64).toBe(btoa('wardley'));
    });
  });

  describe('source order', () => {
    it('exports elements and edges in the order the source declared them', async () => {
      const { warnings } = await modeler.importDSL(NON_CANONICAL_DSL);
      expect(warnings).toEqual([]);
      expect(modeler.exportDSL()).toBe(
        serializeDSL(parseDSLWithDiagnostics(NON_CANONICAL_DSL).map),
      );
    });

    it('changes exactly one line when one element is nudged', async () => {
      await modeler.importDSL(NON_CANONICAL_DSL);
      const before = modeler.exportDSL();
      const registry = modeler.get<ElementRegistry>('elementRegistry');
      modeler.get<Modeling>('modeling').moveElements([findByLabel(registry, 'Water')], {
        x: 0,
        y: -12,
      });
      const after = modeler.exportDSL();
      expect(changedLines(before, after)).toBe(1);
      expect(after).not.toContain('component Water [0.38, 0.82] (buy)');
    });

    it('appends newly created connections after the imported ones', async () => {
      await modeler.importDSL(`title Append
component Alpha [0.8, 0.2]
component Beta [0.5, 0.5]
component Gamma [0.2, 0.8]
Beta -> Gamma
Alpha -> Beta`);
      const registry = modeler.get<ElementRegistry>('elementRegistry');
      modeler
        .get<Modeling>('modeling')
        .connect(findByLabel(registry, 'Alpha'), findByLabel(registry, 'Gamma'), {
          wardleyType: 'dependency',
        });
      const edgeLines = modeler
        .exportDSL()
        .split('\n')
        .filter((line) => line.includes('->'));
      expect(edgeLines).toEqual(['Beta -> Gamma', 'Alpha -> Beta', 'Alpha -> Gamma']);
    });

    it('keeps the source order across a re-import of the exported map', async () => {
      await modeler.importDSL(NON_CANONICAL_DSL);
      const exported = modeler.exportMap();
      await modeler.importMap(exported);
      expect(modeler.exportMap()).toEqual(exported);
    });
  });

  describe('connection z-order', () => {
    function paintOrder(): string[] {
      const registry = modeler.get<ElementRegistry>('elementRegistry');
      const layer = modeler.get<Canvas>('canvas').getActiveLayer() as unknown as SVGGElement;
      return [...layer.querySelectorAll(':scope > .djs-group > .djs-element')]
        .map((gfx) => registry.get(gfx.getAttribute('data-element-id')!))
        .map((element) => {
          if (isWardleyConnection(element)) {
            const name = (shape: unknown) => (shape as WardleyShape).wardleyLabel;
            return `${element.wardleyType}:${name(element.source)}>${name(element.target)}`;
          }
          return `${(element as WardleyShape).wardleyType}:${(element as WardleyShape).wardleyLabel}`;
        });
    }

    it('paints frames, then dependencies, then flows (each in declaration order), then nodes', async () => {
      await modeler.importDSL(`title Z-order
component Developer [0.9, 0.3]
component Developer Portal [0.6, 0.5]
component Billing [0.4, 0.7]
pioneers [0.95, 0.05, 0.7, 0.25]
Developer +'$12/seat'> Developer Portal
Developer -> Developer Portal
Developer Portal +> Billing
Developer Portal -> Billing`);
      expect(paintOrder()).toEqual([
        'attitude:pioneers',
        'dependency:Developer>Developer Portal',
        'dependency:Developer Portal>Billing',
        'flow:Developer>Developer Portal',
        'flow:Developer Portal>Billing',
        'component:Developer',
        'component:Developer Portal',
        'component:Billing',
      ]);
      // The paint order is not the file order: the export still follows the source.
      const edgeLines = modeler
        .exportDSL()
        .split('\n')
        .filter((line) => line.includes('>'));
      expect(edgeLines).toEqual([
        "Developer +'$12/seat'> Developer Portal",
        'Developer -> Developer Portal',
        'Developer Portal +> Billing',
        'Developer Portal -> Billing',
      ]);
    });

    it('slots an interactively drawn dependency below the flows and a new flow on top', async () => {
      await modeler.importDSL(`title Interactive
component Alpha [0.8, 0.2]
component Beta [0.5, 0.5]
component Gamma [0.2, 0.8]
Alpha +> Beta`);
      const registry = modeler.get<ElementRegistry>('elementRegistry');
      const modeling = modeler.get<Modeling>('modeling');
      const alpha = findByLabel(registry, 'Alpha');
      const beta = findByLabel(registry, 'Beta');
      const gamma = findByLabel(registry, 'Gamma');

      modeling.connect(beta, gamma, { wardleyType: 'dependency' });
      modeling.connect(alpha, gamma, { wardleyType: 'flow' });

      expect(paintOrder()).toEqual([
        'dependency:Beta>Gamma',
        'flow:Alpha>Beta',
        'flow:Alpha>Gamma',
        'component:Alpha',
        'component:Beta',
        'component:Gamma',
      ]);
    });
  });

  describe('import warnings', () => {
    it('carries the line and source text of each DSL finding next to the formatted message', async () => {
      const { warnings } = await modeler.importDSL(`title Typo
component Search [0.5, 0.5]
compnent Index [0.4, 0.6]`);
      expect(warnings).toHaveLength(1);
      const [warning] = warnings;
      expect(warning).toMatchObject({ line: 3, source: 'compnent Index [0.4, 0.6]' });
      expect(warning!.message).toMatch(/^Line 3: .+ — "compnent Index \[0\.4, 0\.6\]"$/);
    });
  });
});
