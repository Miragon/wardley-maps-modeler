import type EventBus from 'diagram-js/lib/core/EventBus';
import type { WardleyConnectionType } from '../model/di-types.js';

/**
 * Holds the connection type for the NEXT connect drag (default: dependency).
 * The ContextPad sets it to 'flow' before `connect.start`; the `connection.create` rule reads the
 * mode. After each drag (end OR cancel) the mode automatically falls back to dependency.
 */
export default class WardleyConnectMode {
  static $inject = ['eventBus'];

  private mode: WardleyConnectionType = 'dependency';

  constructor(eventBus: EventBus) {
    eventBus.on('drag.cleanup', () => {
      this.mode = 'dependency';
    });
  }

  setFlow(): void {
    this.mode = 'flow';
  }

  get current(): WardleyConnectionType {
    return this.mode;
  }
}
