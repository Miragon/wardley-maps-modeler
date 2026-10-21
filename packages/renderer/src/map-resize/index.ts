import type { ModuleDeclaration } from 'didi';
import DraggingModule from 'diagram-js/lib/features/dragging';
import MapProjection from './MapProjection.js';
import MapResizeHandles from './MapResizeHandles.js';
import { livePreviewModule } from '../live-preview/index.js';

/** In-place re-projection of all shapes onto a new plot size (used by `wardley.map.resize`). */
export const mapProjectionModule: ModuleDeclaration = {
  __depends__: [livePreviewModule],
  wardleyMapProjection: ['type', MapProjection],
};

/**
 * Plot edge/corner handles to resize the map by dragging (Modeler only). Needs the
 * `wardleyModeling` service, i.e. load it together with `wardleyModelingModule`.
 */
export const mapResizeModule: ModuleDeclaration = {
  __depends__: [DraggingModule, mapProjectionModule],
  __init__: ['mapResizeHandles'],
  mapResizeHandles: ['type', MapResizeHandles],
};

export {
  default as MapResizeHandles,
  MAP_RESIZE_PREFIX,
  sizeForDrag,
  sizeLabel,
} from './MapResizeHandles.js';
export type { ResizeAxis } from './MapResizeHandles.js';
export {
  default as MapProjection,
  configWithSize,
  withoutRawSizeStatements,
  wardleyRootOf,
} from './MapProjection.js';
export type { ProjectionSnapshot, WardleyRoot } from './MapProjection.js';
export { default as ResizeAwareAutoScroll } from './ResizeAwareAutoScroll.js';
