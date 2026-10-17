import { describe, it, expect } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike, ShapeLike } from 'diagram-js/lib/model/Types';
import WardleyOrderingProvider from '../src/ordering/WardleyOrderingProvider.js';
import { isWardleyConnection } from '../src/model/di-types.js';

const attitude = { id: 'attitude', wardleyType: 'attitude', evolution: 0, visibility: 0 };
const importedDependency = { id: 'dep', wardleyType: 'dependency', waypoints: [] };
const platform = { id: 'platform', wardleyType: 'component', evolution: 0.5, visibility: 0.5 };
const customer = { id: 'customer', wardleyType: 'anchor', evolution: 0.4, visibility: 0.9 };

function rootWith(children: object[]): ShapeLike {
  return { id: 'root', children } as unknown as ShapeLike;
}

describe('WardleyOrderingProvider', () => {
  const provider = new WardleyOrderingProvider(new EventBus());
  const root = rootWith([attitude, importedDependency, platform, customer]);

  // Regression: connect/append hand the connection to `connection.create` WITHOUT waypoints (the
  // layouter fills them in during execute). It used to be ordered like a node — on top of the
  // components, so its hit band swallowed the drag on the component it leaves from.
  it('places a not-yet-laid-out connection behind the nodes', () => {
    const newDependency = { id: 'new', wardleyType: 'dependency' } as unknown as ElementLike;
    expect(provider.getOrdering(newDependency, root).index).toBe(2);
  });

  it('keeps frames at the very back and nodes on top', () => {
    const newAttitude = { ...attitude, id: 'attitude2' } as unknown as ElementLike;
    const newComponent = { ...platform, id: 'platform2' } as unknown as ElementLike;
    expect(provider.getOrdering(newAttitude, root).index).toBe(1);
    expect(provider.getOrdering(newComponent, root).index).toBeUndefined();
  });
});

describe('WardleyOrderingProvider with flows and dependencies', () => {
  const provider = new WardleyOrderingProvider(new EventBus());
  const pipeline = { id: 'pipeline', wardleyType: 'pipeline', evolution: 0.2, visibility: 0.3 };
  const firstDependency = { id: 'dep1', wardleyType: 'dependency', waypoints: [] };
  const secondDependency = { id: 'dep2', wardleyType: 'dependency', waypoints: [] };
  const importedFlow = { id: 'flow1', wardleyType: 'flow', waypoints: [] };
  // Import order: frames -> dependencies -> flows -> nodes.
  const root = rootWith([
    attitude,
    pipeline,
    firstDependency,
    secondDependency,
    importedFlow,
    platform,
    customer,
  ]);

  it('slots a new dependency above the dependencies but below the flows', () => {
    const newDependency = { id: 'new-dep', wardleyType: 'dependency' } as unknown as ElementLike;
    expect(provider.getOrdering(newDependency, root).index).toBe(4);
  });

  it('puts a new flow on top of all connections, still behind the nodes', () => {
    const newFlow = { id: 'new-flow', wardleyType: 'flow' } as unknown as ElementLike;
    expect(provider.getOrdering(newFlow, root).index).toBe(5);
  });

  it('does not count the moved connection itself', () => {
    expect(provider.getOrdering(firstDependency as unknown as ElementLike, root).index).toBe(3);
    expect(provider.getOrdering(importedFlow as unknown as ElementLike, root).index).toBe(4);
  });
});

describe('isWardleyConnection', () => {
  it('recognises connections by their type, with or without waypoints', () => {
    expect(isWardleyConnection({ wardleyType: 'dependency' })).toBe(true);
    expect(isWardleyConnection({ wardleyType: 'flow', waypoints: [] })).toBe(true);
    expect(isWardleyConnection(platform)).toBe(false);
    expect(isWardleyConnection({ waypoints: [] })).toBe(false);
  });
});
