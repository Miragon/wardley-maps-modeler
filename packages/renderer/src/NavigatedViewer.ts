import type { ModuleDeclaration } from 'didi';
import SelectionModule from 'diagram-js/lib/features/selection';
import ZoomScrollModule from 'diagram-js/lib/navigation/zoomscroll';
import MoveCanvasModule from 'diagram-js/lib/navigation/movecanvas';
import KeyboardModule from 'diagram-js/lib/features/keyboard';
import { Viewer } from './Viewer.js';
import { PanConstraintModule } from './pan-constraint/index.js';

/**
 * `keyboard-move-selection` depends on `modeling` and therefore belongs in the (later) Modeler,
 * not in the read-only NavigatedViewer.
 */
export class NavigatedViewer extends Viewer {
  protected override _getModules(): ModuleDeclaration[] {
    return [
      ...super._getModules(),
      SelectionModule,
      ZoomScrollModule,
      MoveCanvasModule,
      KeyboardModule,
      PanConstraintModule,
    ];
  }
}
