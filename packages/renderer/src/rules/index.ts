import type { ModuleDeclaration } from 'didi';
import WardleyRules from './WardleyRules.js';

/** Allowed Wardley operations (RuleProvider). */
export const wardleyRulesModule: ModuleDeclaration = {
  __init__: ['wardleyRules'],
  wardleyRules: ['type', WardleyRules],
};

export { default as WardleyRules } from './WardleyRules.js';
