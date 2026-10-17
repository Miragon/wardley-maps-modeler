/**
 * Replacing the whole map (example, open, new, pasted text, applied text, a new link) clears the
 * modeler's undo history. Instead of asking first, every replacement keeps a text snapshot of the
 * previous map and offers to bring it back ("Map replaced · Undo").
 */

export interface MapReplacerDependencies {
  /** True when there is nothing worth keeping (no snapshot, no undo offer). */
  isBlank(): boolean;
  /** The current map as text (lossless). */
  snapshot(): string;
  /** Re-imports a snapshot. */
  restore(snapshot: string): Promise<void>;
  /** Offers the undo; returns a handle to withdraw the offer when a newer replacement follows. */
  offerUndo(undo: () => void): { dismiss(): void };
}

export interface MapReplacer {
  replace<T>(run: () => Promise<T>): Promise<T>;
  /**
   * Withdraws the open undo offer. Call it when the user changes the map: restoring the snapshot
   * afterwards would silently throw that work away.
   */
  withdrawUndo(): void;
  /**
   * Whether the last replacement can still be undone. The offer outlives its toast until the
   * next edit or replacement, so Undo (menu, Cmd/Ctrl+Z) can still bring the map back.
   */
  hasPendingUndo(): boolean;
  /** Brings the replaced map back (no-op without a pending offer). */
  undoPending(): void;
}

export function createMapReplacer(dependencies: MapReplacerDependencies): MapReplacer {
  let pendingOffer: { handle: { dismiss(): void }; undo(): void } | undefined;

  const withdrawUndo = (): void => {
    pendingOffer?.handle.dismiss();
    pendingOffer = undefined;
  };

  return {
    withdrawUndo,
    hasPendingUndo: () => pendingOffer !== undefined,
    undoPending(): void {
      const offer = pendingOffer;
      if (!offer) return;
      offer.handle.dismiss();
      offer.undo();
    },
    async replace<T>(run: () => Promise<T>): Promise<T> {
      const before = dependencies.snapshot();
      const worthKeeping = !dependencies.isBlank();
      const result = await run();
      if (dependencies.snapshot() === before) return result;

      // An older offer would now replace this newer map, also when the map before was blank.
      withdrawUndo();
      if (!worthKeeping) return result;
      const offer = {
        handle: { dismiss: () => {} },
        undo: () => {
          if (pendingOffer === offer) pendingOffer = undefined;
          void dependencies.restore(before);
        },
      };
      offer.handle = dependencies.offerUndo(offer.undo);
      pendingOffer = offer;
      return result;
    },
  };
}
