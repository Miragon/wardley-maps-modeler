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

describe('isWardleyConnection', () => {
  it('recognises connections by their type, with or without waypoints', () => {
    expect(isWardleyConnection({ wardleyType: 'dependency' })).toBe(true);
    expect(isWardleyConnection({ wardleyType: 'flow', waypoints: [] })).toBe(true);
    expect(isWardleyConnection(platform)).toBe(false);
    expect(isWardleyConnection({ waypoints: [] })).toBe(false);
  });
});
