import type { ModuleDeclaration } from 'didi';
import WardleyDrawTool from './WardleyDrawTool.js';

export const wardleyDrawToolModule: ModuleDeclaration = {
  __init__: ['wardleyDrawTool'],
  wardleyDrawTool: ['type', WardleyDrawTool],
};

export { default as WardleyDrawTool } from './WardleyDrawTool.js';
