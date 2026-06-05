import type { ModuleDeclaration } from 'didi';
import SelectionModule from 'diagram-js/lib/features/selection';
import ZoomScrollModule from 'diagram-js/lib/navigation/zoomscroll';
import MoveCanvasModule from 'diagram-js/lib/navigation/movecanvas';
import KeyboardModule from 'diagram-js/lib/features/keyboard';
import { Viewer } from './Viewer.js';

/**
 * Read-only + Navigation: Zoom (Scroll), Pan (Drag/Tastatur), Selektion.
 * Hinweis: `keyboard-move-selection` haengt von `modeling` ab und gehoert daher erst in den
 * (spaeteren) Modeler, nicht in den read-only NavigatedViewer.
 */
export class NavigatedViewer extends Viewer {
  protected override _getModules(): ModuleDeclaration[] {
    return [
      ...super._getModules(),
      SelectionModule,
      ZoomScrollModule,
      MoveCanvasModule,
      KeyboardModule,
    ];
  }
}
