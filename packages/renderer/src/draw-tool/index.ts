import type { ModuleDeclaration } from 'didi';
import WardleyDrawTool from './WardleyDrawTool.js';
import WardleyDrawingHandles from './WardleyDrawingHandles.js';

export const wardleyDrawToolModule: ModuleDeclaration = {
  __init__: ['wardleyDrawTool', 'wardleyDrawingHandles'],
  wardleyDrawTool: ['type', WardleyDrawTool],
  wardleyDrawingHandles: ['type', WardleyDrawingHandles],
};

export { default as WardleyDrawTool } from './WardleyDrawTool.js';
export { default as WardleyDrawingHandles } from './WardleyDrawingHandles.js';
