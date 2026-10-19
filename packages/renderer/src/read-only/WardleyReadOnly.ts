import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Injector } from 'didi';

/** Fired with `{ readOnly }` whenever the lock changes. */
export const READ_ONLY_CHANGED = 'wardley.readOnly.changed';

/** On the viewer container while locked: the CSS hides the editing handles. */
const LOCKED_CLASS = 'wardley-read-only';

/** Ahead of every rule of the notation, so nothing can allow what the lock forbids. */
const VETO_PRIORITY = 5000;

const EDIT_RULES = [
  'elements.move',
  'shape.move',
  'shape.create',
  'elements.create',
  'shape.resize',
  'shape.append',
  'shape.replace',
  'connection.start',
  'connection.create',
  'connection.reconnect',
  'connection.reconnectStart',
  'connection.reconnectEnd',
  'connection.updateWaypoints',
  'elements.delete',
];

interface Closable {
  close(): void;
}

interface Cancellable {
  cancel(): void;
}

/**
 * Locks every edit on the canvas while a host cannot save what the canvas would change: an
 * invalid file in an IDE shows the last valid map read-only until the text is valid again (guide
 * §13.5). The rules veto move, resize, create, connect and delete; the context pad, the label,
 * link and colour editors, the evolve, label and drawing handles, the map-size handles, the draw
 * tool and the edit keys ask `isReadOnly()`. Selection, zoom, pan, copy and export stay.
 */
export default class WardleyReadOnly extends RuleProvider {
  static override $inject = ['eventBus', 'canvas', 'injector'];

  private locked = false;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly injector: Injector,
  ) {
    super(eventBus);
  }

  override init(): void {
    // `this.locked` is read when a rule runs; the field is not initialized yet while init() runs.
    this.addRule(EDIT_RULES, VETO_PRIORITY, () => (this.locked ? false : undefined));
  }

  isReadOnly(): boolean {
    return this.locked;
  }

  setReadOnly(readOnly: boolean): void {
    if (this.locked === readOnly) return;
    this.locked = readOnly;
    this.outerContainer().classList.toggle(LOCKED_CLASS, readOnly);
    if (readOnly) this.endInteractions();
    this.injector.get<EventBus>('eventBus').fire(READ_ONLY_CHANGED, { readOnly });
  }

  /** Whatever is open or running would otherwise still change the map. */
  private endInteractions(): void {
    this.injector.get<Cancellable | null>('dragging', false)?.cancel();
    for (const name of ['contextPad', 'popupMenu', 'wardleyColorPicker']) {
      this.injector.get<Closable | null>(name, false)?.close();
    }
    for (const name of ['wardleyLabelEditing', 'wardleyLinkEditing', 'wardleyDrawTool']) {
      this.injector.get<Cancellable | null>(name, false)?.cancel();
    }
  }

  private outerContainer(): HTMLElement {
    const container = this.canvas.getContainer();
    return (container.closest('.wardley-container') as HTMLElement | null) ?? container;
  }
}
