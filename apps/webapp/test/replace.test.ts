import { describe, expect, it, vi } from 'vitest';
import { createMapReplacer } from '../src/replace.js';

/** A fake app: `map` stands for the canvas content, `offers` for the visible undo toasts. */
function fakeApp(initial: string, blank = false) {
  const state = { map: initial, blank };
  const offers: Array<{ undo: () => void; dismissed: boolean }> = [];
  const restore = vi.fn(async (snapshot: string) => {
    state.map = snapshot;
  });
  const replacer = createMapReplacer({
    isBlank: () => state.blank,
    snapshot: () => state.map,
    restore,
    offerUndo: (undo) => {
      const offer = { undo, dismissed: false };
      offers.push(offer);
      return { dismiss: () => (offer.dismissed = true) };
    },
  });
  const replaceMap = <T>(run: () => Promise<T>) => replacer.replace(run);
  const load = (next: string) =>
    replaceMap(async () => {
      state.map = next;
      state.blank = false;
      return next.length;
    });
  return { state, offers, restore, replacer, replaceMap, load };
}

describe('createMapReplacer', () => {
  it('offers to bring the previous map back', async () => {
    const app = fakeApp('title Mine');
    expect(await app.load('title Example')).toBe('title Example'.length);
    expect(app.offers).toHaveLength(1);
    app.offers[0]!.undo();
    await Promise.resolve();
    expect(app.restore).toHaveBeenCalledWith('title Mine');
    expect(app.state.map).toBe('title Mine');
  });

  it('offers nothing when the previous map was blank', async () => {
    const app = fakeApp('title Untitled Map', true);
    await app.load('title Example');
    expect(app.offers).toHaveLength(0);
  });

  it('offers nothing when the import left the map unchanged', async () => {
    const app = fakeApp('title Same');
    await app.load('title Same');
    expect(app.offers).toHaveLength(0);
  });

  it('withdraws an older offer when the map is replaced again', async () => {
    const app = fakeApp('title First');
    await app.load('title Second');
    await app.load('title Third');
    expect(app.offers.map((offer) => offer.dismissed)).toEqual([true, false]);
    app.offers[1]!.undo();
    expect(app.restore).toHaveBeenCalledWith('title Second');
  });

  it('withdraws an older offer when a blank map is replaced, so it cannot discard the new map', async () => {
    const app = fakeApp('title Mine');
    await app.load('');
    app.state.blank = true;
    await app.load('title Opened');
    expect(app.offers).toHaveLength(1);
    expect(app.offers[0]!.dismissed).toBe(true);
  });

  it('keeps the offer when a later replacement changes nothing', async () => {
    const app = fakeApp('title Mine');
    await app.load('');
    app.state.blank = true;
    await app.load('');
    expect(app.offers.map((offer) => offer.dismissed)).toEqual([false]);
  });

  it('withdraws the offer when the user edits the new map', async () => {
    const app = fakeApp('title Mine');
    await app.load('title Example');
    app.replacer.withdrawUndo();
    expect(app.offers[0]!.dismissed).toBe(true);
  });

  it('keeps the map and offers nothing when the import fails', async () => {
    const app = fakeApp('title Mine');
    await expect(
      app.replaceMap(async () => {
        throw new Error('not a map');
      }),
    ).rejects.toThrow('not a map');
    expect(app.state.map).toBe('title Mine');
    expect(app.offers).toHaveLength(0);
  });

  it('keeps the offer after its toast is gone and undoes it on request', async () => {
    const app = fakeApp('title Mine');
    await app.load('title Example');
    expect(app.replacer.hasPendingUndo()).toBe(true);
    app.replacer.undoPending();
    await Promise.resolve();
    expect(app.state.map).toBe('title Mine');
    expect(app.offers[0]!.dismissed).toBe(true);
    expect(app.replacer.hasPendingUndo()).toBe(false);
    app.replacer.undoPending();
    expect(app.restore).toHaveBeenCalledTimes(1);
  });

  it('has nothing to undo once the new map is edited', async () => {
    const app = fakeApp('title Mine');
    await app.load('title Example');
    app.replacer.withdrawUndo();
    expect(app.replacer.hasPendingUndo()).toBe(false);
  });
});
