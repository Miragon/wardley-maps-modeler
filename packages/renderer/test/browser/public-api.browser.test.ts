import { describe, expect, it } from 'vitest';
import type { ModuleDeclaration } from 'didi';
import * as api from '../../src/index.js';

describe('public API', () => {
  it('exports every Wardley module the Modeler is built from, for custom editors', () => {
    const modeler = new api.Modeler();
    const modules = (modeler as unknown as { _getModules(): ModuleDeclaration[] })._getModules();
    const exported = new Set<unknown>(Object.values(api));
    const ownService =
      /^(wardley|mapResize|mapProjection|pipelineGroup|evolution|stageSnapping|panConstraint)/u;
    const wardleyModules = modules.filter(
      (module) =>
        module === api.canvasAccessibilityModule ||
        Object.keys(module).some((name) => ownService.test(name)),
    );
    expect(wardleyModules.length).toBeGreaterThan(10);
    for (const module of wardleyModules) {
      expect(exported.has(module), JSON.stringify(Object.keys(module))).toBe(true);
    }
    modeler.destroy();
  });
});
