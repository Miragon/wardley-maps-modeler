import type { ModuleDeclaration } from 'didi';
import type CommandStack from 'diagram-js/lib/command/CommandStack';

import ModelingModule from 'diagram-js/lib/features/modeling';
import MoveModule from 'diagram-js/lib/features/move';
import CreateModule from 'diagram-js/lib/features/create';
import ConnectModule from 'diagram-js/lib/features/connect';
import ContextPadModule from 'diagram-js/lib/features/context-pad';
import PaletteModule from 'diagram-js/lib/features/palette';
import RulesModule from 'diagram-js/lib/features/rules';
import OutlineModule from 'diagram-js/lib/features/outline';
import ResizeModule from 'diagram-js/lib/features/resize';
import PopupMenuModule from 'diagram-js/lib/features/popup-menu';

import { NavigatedViewer } from './NavigatedViewer.js';
import { wardleyModelingModule } from './modeling/index.js';
import { wardleyRulesModule } from './rules/index.js';
import { evolutionConstraintModule } from './evolution-grid/index.js';
import { stageSnappingModule } from './snapping/index.js';
import { wardleyPaletteModule } from './palette/index.js';
import { wardleyContextPadModule } from './context-pad/index.js';
import { labelEditingModule } from './label-editing/index.js';
import { wardleyKeyboardModule } from './keyboard/index.js';
import { wardleyEvolveModule } from './evolve/index.js';
import { wardleyPopupModule } from './popup/index.js';
import { wardleyAppendModule } from './append/index.js';

/**
 * Voller Wardley-Editor: Palette/Create, Move mit EvolutionConstraint + Stage-Snapping,
 * Connect mit Rules, ContextPad, Inline-Label-Editing, Undo/Redo (Konzept §6.1, Roadmap M3).
 */
export class Modeler extends NavigatedViewer {
  protected override _getModules(): ModuleDeclaration[] {
    return [
      ...super._getModules(),
      // diagram-js Stock
      ModelingModule,
      RulesModule,
      MoveModule,
      CreateModule,
      ConnectModule,
      ContextPadModule,
      PaletteModule,
      OutlineModule,
      ResizeModule,
      PopupMenuModule,
      // Wardley-Editor
      wardleyModelingModule,
      wardleyRulesModule,
      evolutionConstraintModule,
      stageSnappingModule,
      wardleyPaletteModule,
      wardleyContextPadModule,
      labelEditingModule,
      wardleyKeyboardModule,
      wardleyEvolveModule,
      wardleyPopupModule,
      wardleyAppendModule,
    ];
  }

  /** Letzte Mutation rueckgaengig machen. */
  undo(): void {
    this.get<CommandStack>('commandStack').undo();
  }

  /** Rueckgaengig gemachte Mutation wiederholen. */
  redo(): void {
    this.get<CommandStack>('commandStack').redo();
  }

  canUndo(): boolean {
    return this.get<CommandStack>('commandStack').canUndo();
  }

  canRedo(): boolean {
    return this.get<CommandStack>('commandStack').canRedo();
  }
}
