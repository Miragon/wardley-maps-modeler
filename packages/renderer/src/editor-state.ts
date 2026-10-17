import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element } from 'diagram-js/lib/model/Types';
import type { Modeler } from './Modeler.js';
import type WardleyLabelEditing from './label-editing/WardleyLabelEditing.js';
import type { FieldSelection } from './label-editing/WardleyLabelEditing.js';
import type WardleyLinkEditing from './link-editing/WardleyLinkEditing.js';
import { isWardleyConnection, isWardleyShape, type WardleyConnection } from './model/di-types.js';
import { focusCanvasWithoutRing } from './a11y/index.js';

/**
 * A connection by what it joins: dependency ids are positional (`dep_3`), so after a re-import the
 * same id may name a different link.
 */
interface ConnectionKey {
  sourceId: string;
  targetId: string;
  wardleyType: string;
}

type OpenEdit =
  | { kind: 'name'; elementId: string; value: string; selection?: FieldSelection }
  | { kind: 'connection'; key: ConnectionKey; value: string; selection?: FieldSelection }
  | { kind: 'link'; elementId: string; value: string };

/** What the user had selected and was typing, put aside across a re-import. */
export interface EditorState {
  readonly shapeIds: readonly string[];
  readonly connections: readonly ConnectionKey[];
  readonly edit?: OpenEdit;
}

function keyOf(connection: WardleyConnection): ConnectionKey {
  return {
    sourceId: connection.source?.id ?? '',
    targetId: connection.target?.id ?? '',
    wardleyType: connection.wardleyType,
  };
}

function findConnection(
  registry: ElementRegistry,
  key: ConnectionKey,
): WardleyConnection | undefined {
  return registry.find(
    (element) =>
      isWardleyConnection(element) &&
      element.source?.id === key.sourceId &&
      element.target?.id === key.targetId &&
      element.wardleyType === key.wardleyType,
  ) as WardleyConnection | undefined;
}

/**
 * Captures the selection and any open inline editor, and closes the editor without saving (a save
 * would push a command onto a stack the import is about to clear). Call before re-importing a map
 * that changed outside the editor, then `restoreEditorState` afterwards.
 */
export function setAsideEditorState(modeler: Modeler): EditorState {
  const selected = modeler.get<Selection>('selection').get() as unknown[];
  const registry = modeler.get<ElementRegistry>('elementRegistry');
  const labelEditing = modeler.get<WardleyLabelEditing>('wardleyLabelEditing');
  const linkEditing = modeler.get<WardleyLinkEditing>('wardleyLinkEditing');

  let edit: OpenEdit | undefined;
  const nameEdit = labelEditing.getActiveEdit();
  const linkEdit = linkEditing.getActiveEdit();
  if (nameEdit?.connection) {
    const connection = registry.get(nameEdit.elementId);
    if (isWardleyConnection(connection)) {
      edit = {
        kind: 'connection',
        key: keyOf(connection),
        value: nameEdit.value,
        ...(nameEdit.selection ? { selection: nameEdit.selection } : {}),
      };
    }
  } else if (nameEdit) {
    edit = {
      kind: 'name',
      elementId: nameEdit.elementId,
      value: nameEdit.value,
      ...(nameEdit.selection ? { selection: nameEdit.selection } : {}),
    };
  } else if (linkEdit) {
    edit = { kind: 'link', elementId: linkEdit.elementId, value: linkEdit.value };
  }
  labelEditing.cancel();
  linkEditing.cancel();

  return {
    shapeIds: selected.filter(isWardleyShape).map((shape) => shape.id),
    connections: selected.filter(isWardleyConnection).map(keyOf),
    ...(edit ? { edit } : {}),
  };
}

/**
 * Brings back what `setAsideEditorState` captured, for the elements that still exist: names are
 * stable ids (`cmp_tea`), connections are matched by their ends. An editor whose element is gone
 * leaves keyboard focus on the canvas rather than on the page.
 */
export function restoreEditorState(modeler: Modeler, state: EditorState): void {
  const registry = modeler.get<ElementRegistry>('elementRegistry');
  const shapes = state.shapeIds.map((id) => registry.get(id)).filter(isWardleyShape);
  const connections = state.connections
    .map((key) => findConnection(registry, key))
    .filter((connection): connection is WardleyConnection => connection !== undefined);
  const reselected = [...shapes, ...connections] as unknown as Element[];
  if (reselected.length) modeler.get<Selection>('selection').select(reselected);

  const { edit } = state;
  if (!edit) return;
  const labelEditing = modeler.get<WardleyLabelEditing>('wardleyLabelEditing');
  const restored = (() => {
    if (edit.kind === 'connection') {
      const connection = findConnection(registry, edit.key);
      if (!connection) return false;
      labelEditing.activateConnection(connection, {
        value: edit.value,
        ...(edit.selection ? { selection: edit.selection } : {}),
      });
      return true;
    }
    const shape = registry.get(edit.elementId);
    if (!isWardleyShape(shape)) return false;
    if (edit.kind === 'link') {
      modeler.get<WardleyLinkEditing>('wardleyLinkEditing').activate(shape, { value: edit.value });
    } else {
      labelEditing.activate(shape, {
        value: edit.value,
        ...(edit.selection ? { selection: edit.selection } : {}),
      });
    }
    return true;
  })();
  if (!restored) focusCanvasWithoutRing(modeler.get<Canvas>('canvas'));
}
