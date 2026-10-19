import type { ModuleDeclaration } from 'didi';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type WardleyLabelEditing from './label-editing/WardleyLabelEditing.js';
import type WardleyLinkEditing from './link-editing/WardleyLinkEditing.js';

import ModelingModule from 'diagram-js/lib/features/modeling';
import MoveModule from 'diagram-js/lib/features/move';
import AutoScrollModule from 'diagram-js/lib/features/auto-scroll';
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
import { wardleyLayoutModule } from './layout/index.js';
import { wardleyLassoModule } from './lasso/index.js';
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
import { wardleyColorPickerModule } from './color-picker/index.js';
import { wardleyOrderingModule } from './ordering/index.js';
import { wardleyDrawToolModule } from './draw-tool/index.js';
import { pipelineGroupModule } from './pipeline/index.js';
import { ResizeAwareAutoScroll, mapResizeModule } from './map-resize/index.js';
import { linkEditingModule } from './link-editing/index.js';
import { wardleyLabelDragModule } from './label-drag/index.js';
import { canvasAccessibilityModule } from './a11y/index.js';
import { readOnlyModule } from './read-only/index.js';

/** Replaces diagram-js AutoScroll: no scrolling under a map-resize drag. */
const resizeAwareAutoScrollModule: ModuleDeclaration = {
  autoScroll: ['type', ResizeAwareAutoScroll],
};

/**
 * Full Wardley editor: palette/create, move with EvolutionConstraint + stage snapping, connect with
 * rules, context pad, inline label editing, undo/redo (concept doc §6.1, roadmap M3).
 */
export class Modeler extends NavigatedViewer {
  protected override _getModules(): ModuleDeclaration[] {
    return [
      ...super._getModules(),
      ModelingModule,
      wardleyLayoutModule,
      RulesModule,
      MoveModule,
      // Default 20px bands on every side; a larger top band would scroll as soon as an element is
      // dragged out of the top-centred palette.
      AutoScrollModule,
      resizeAwareAutoScrollModule,
      CreateModule,
      ConnectModule,
      ContextPadModule,
      PaletteModule,
      OutlineModule,
      ResizeModule,
      PopupMenuModule,
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
      wardleyColorPickerModule,
      wardleyLassoModule,
      wardleyOrderingModule,
      wardleyDrawToolModule,
      pipelineGroupModule,
      mapResizeModule,
      linkEditingModule,
      canvasAccessibilityModule,
      wardleyLabelDragModule,
      readOnlyModule,
    ];
  }

  /**
   * Saves any open inline editor (name, note, link annotation, flow value, link address). Call it
   * before saving or exporting from a keyboard shortcut, which does not take focus off the editor.
   */
  commitPendingEdits(): void {
    this.get<WardleyLabelEditing>('wardleyLabelEditing').commitActiveEdit();
    this.get<WardleyLinkEditing>('wardleyLinkEditing').commitActiveEdit();
  }

  undo(): void {
    this.get<CommandStack>('commandStack').undo();
  }

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
