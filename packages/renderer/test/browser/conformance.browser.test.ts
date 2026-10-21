import { afterAll, afterEach, describe, expect, test } from 'vitest';
import {
  attachedHost,
  registerConformance,
  type ConformanceHarness,
} from '@miragon/modeler-api/conformance';
import type { CollaborativeModeler } from '@miragon/modeler-api';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Shape } from 'diagram-js/lib/model/Types';
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeWardleyModeler,
  type Modeler,
} from '../../src/index.js';
import type WardleyElementFactory from '../../src/model/WardleyElementFactory.js';
import type WardleyLabelEditing from '../../src/label-editing/WardleyLabelEditing.js';
import type { WardleyShape } from '../../src/model/di-types.js';
import teaShop from './fixtures/tea-shop.wmap?raw';
import teaShopLoose from './fixtures/tea-shop.loose.wmap?raw';
import teaShopForeign from './fixtures/tea-shop.foreign.wmap?raw';
import platformStrategy from './fixtures/platform-strategy.wmap?raw';
import '../../src/assets/wardley.css';

const hostWrappers: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of hostWrappers.splice(0)) wrapper.remove();
});

function mountedHost(): HTMLElement {
  const host = attachedHost();
  if (host.parentElement) hostWrappers.push(host.parentElement);
  return host;
}

function diagramOf(modeler: CollaborativeModeler): Modeler {
  return (modeler as CollaborativeWardleyModeler).diagram as Modeler;
}

// Shared across instances: every call adds a component of its own name, so the kit's collision
// case compares the ids two peers allocate for different components (an id derived from the
// name, `cmp_<name>`, collides only for the same name).
let createdComponents = 0;

function addComponent(modeler: CollaborativeModeler): void {
  const diagram = diagramOf(modeler);
  createdComponents += 1;
  const component = diagram
    .get<WardleyElementFactory>('wardleyElementFactory')
    .createNew('component', `Added Component ${createdComponents}`);
  diagram
    .get<Modeling>('modeling')
    .createShape(
      component as unknown as Shape,
      { x: 400, y: 300 },
      diagram.get<Canvas>('canvas').getRootElement() as Shape,
    );
}

/** Moves the imported component Kettle by its own command, as a drag does. */
function moveKettle(modeler: CollaborativeModeler): string {
  const id = modeler.elements?.list().find((element) => element.name === 'Kettle')?.id;
  if (!id) throw new Error('the imported map has no component Kettle to move');
  const diagram = diagramOf(modeler);
  const kettle = diagram.get<ElementRegistry>('elementRegistry').get(id);
  if (!kettle) throw new Error(`no canvas element ${id}`);
  diagram.get<Modeling>('modeling').moveElements([kettle as Shape], { x: 60, y: 40 });
  return id;
}

function labelField(modeler: CollaborativeModeler): HTMLInputElement | null {
  return diagramOf(modeler)
    .get<Canvas>('canvas')
    .getContainer()
    .querySelector<HTMLInputElement>('input.wardley-label-input');
}

function typedHalfway(fragment: string, typedSoFar: string): string {
  if (!teaShop.includes(fragment)) throw new Error(`the fixture lost "${fragment}"`);
  return teaShop.replace(fragment, typedSoFar);
}

const harness: ConformanceHarness = {
  async create() {
    const modeler = createCollaborativeModeler();
    modeler.attachTo(mountedHost());
    return modeler;
  },
  async createReadonly() {
    const viewer = createCollaborativeViewer();
    viewer.attachTo(mountedHost());
    return viewer;
  },
  // Reviewed: each is serializeDSL's output for a hand-written map, every statement accounted for.
  canonicalTexts: [teaShop, platformStrategy],
  looseTexts: [teaShopLoose],
  // The DSL reads every text: an unreadable line stays in rawPassthrough with a diagnostic.
  invalidTexts: [],
  foreignTexts: [{ text: teaShopForeign, mustSurvive: ['x-vendor: keep-me', 'owner team-tea'] }],
  viewState: { x: 120, y: 80, width: 640, height: 480 },
  mutate: addComponent,
  configMutations: [
    {
      name: 'x-axis labels',
      run: (modeler) =>
        diagramOf(modeler).setEvolutionLabels(['Idea', 'Craft', 'Product', 'Utility']),
    },
    { name: 'title', run: (modeler) => diagramOf(modeler).setTitle('Renamed map') },
    {
      name: 'map size',
      run: (modeler) =>
        diagramOf(modeler)
          .setMapSize(1500, 950)
          .then(() => {}),
    },
  ],
  undo: (modeler) => diagramOf(modeler).get<CommandStack>('commandStack').undo(),
  redo: (modeler) => diagramOf(modeler).get<CommandStack>('commandStack').redo(),
  moveElement: moveKettle,
  settle: () => new Promise((resolve) => setTimeout(resolve, 30)),
  // damaged forms the DSL meets while a peer types, on top of the probes the kit derives
  probeTexts: [
    typedHalfway('[0.43, 0.35]', '[0.43,'),
    typedHalfway('Hot Water -> Kettle; limited by', 'Hot Water -> Ket'),
    typedHalfway('pipeline Kettle [0.3, 0.65]', 'pipeline Kettle {'),
    typedHalfway('evolve Kettle 0.62', 'evolve Kettle 0.6e999'),
    'component Unclosed [0.5',
  ],
  openInteraction(modeler) {
    const diagram = diagramOf(modeler);
    const kettle = diagram.get<ElementRegistry>('elementRegistry').get('cmp_kettle');
    if (!kettle) throw new Error('the imported map has no component cmp_kettle to edit');
    diagram.get<WardleyLabelEditing>('wardleyLabelEditing').activate(kettle as WardleyShape);
    const field = labelField(modeler);
    if (!field) throw new Error('no label editor opened');
    field.value = 'typed, not committed';
  },
  interactionState(modeler) {
    const edit = diagramOf(modeler).get<WardleyLabelEditing>('wardleyLabelEditing').getActiveEdit();
    return edit ? { elementId: edit.elementId, text: edit.value } : undefined;
  },
  commitInteraction(modeler) {
    const field = labelField(modeler);
    if (!field) throw new Error('no label editor open to commit');
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
  },
};

// No case is inapplicable to Wardley maps: the harness fills every optional hook, and the kit
// takes `invalidTexts: []` as a declaration, not a skip. A skip is therefore a gap in the harness.
const failOnSkip = {
  onSkip(caseName: string, reason: string): never {
    throw new Error(`conformance case skipped: "${caseName}" — ${reason}`);
  },
};

const advisories: string[] = [];

describe('Wardley maps implement the collaborative-modeler contract', () => {
  registerConformance(harness, test, {
    ...failOnSkip,
    onAdvisory(caseName, advice) {
      advisories.push(`${caseName}: ${advice}`);
    },
  });

  // Names are unique on a map and ids derive from them, so peers never allocate the same id for
  // different elements, an open label editor comes back after a re-import, and a host's view
  // change leaves it open.
  afterAll(() => {
    expect(advisories).toEqual([]);
  });
});
