import type { ModuleDeclaration } from 'didi';
import LivePreview from './LivePreview.js';

/** The committed document behind a live preview (map size, axis labels). */
export const livePreviewModule: ModuleDeclaration = {
  wardleyLivePreview: ['type', LivePreview],
};

export { default as LivePreview, COMMAND_START_EVENTS, PUT_BACK_PRIORITY } from './LivePreview.js';
