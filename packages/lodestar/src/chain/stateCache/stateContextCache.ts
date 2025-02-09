import {ByteVector, toHexString} from "@chainsafe/ssz";
import {phase0, Epoch} from "@chainsafe/lodestar-types";
import {CachedBeaconState} from "@chainsafe/lodestar-beacon-state-transition";

const MAX_STATES = 96;

/**
 * In memory cache of CachedBeaconState
 *
 * Similar API to Repository
 */
export class StateContextCache {
  /**
   * Max number of states allowed in the cache
   */
  maxStates: number;

  private cache = new Map<string, CachedBeaconState<phase0.BeaconState>>();
  /** Epoch -> Set<blockRoot> */
  private epochIndex = new Map<Epoch, Set<string>>();

  constructor(maxStates = MAX_STATES) {
    this.maxStates = maxStates;
  }

  get(root: ByteVector): CachedBeaconState<phase0.BeaconState> | null {
    const item = this.cache.get(toHexString(root));
    if (!item) {
      return null;
    }
    return item.clone();
  }

  add(item: CachedBeaconState<phase0.BeaconState>): void {
    const key = toHexString(item.hashTreeRoot());
    if (this.cache.get(key)) {
      return;
    }
    this.cache.set(key, item.clone());
    const epoch = item.epochCtx.currentShuffling.epoch;
    const blockRoots = this.epochIndex.get(epoch);
    if (blockRoots) {
      blockRoots.add(key);
    } else {
      this.epochIndex.set(epoch, new Set([key]));
    }
  }

  delete(root: ByteVector): void {
    const key = toHexString(root);
    const item = this.cache.get(key);
    if (!item) return;
    this.epochIndex.get(item.epochCtx.currentShuffling.epoch)?.delete(key);
    this.cache.delete(key);
  }

  batchDelete(roots: ByteVector[]): void {
    roots.map((root) => this.delete(root));
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * TODO make this more robust.
   * Without more thought, this currently breaks our assumptions about recent state availablity
   */
  prune(headStateRoot: ByteVector): void {
    const keys = Array.from(this.cache.keys());
    if (keys.length > this.maxStates) {
      const headStateRootHex = toHexString(headStateRoot);
      // object keys are stored in insertion order, delete keys starting from the front
      for (const key of keys.slice(0, keys.length - this.maxStates)) {
        if (key !== headStateRootHex) {
          const item = this.cache.get(key);
          if (item) {
            this.epochIndex.get(item.epochCtx.currentShuffling.epoch)?.delete(key);
            this.cache.delete(key);
          }
        }
      }
    }
  }

  /**
   * Prune per finalized epoch.
   */
  async deleteAllBeforeEpoch(finalizedEpoch: Epoch): Promise<void> {
    for (const epoch of this.epochIndex.keys()) {
      if (epoch < finalizedEpoch) {
        this.deleteAllEpochItems(epoch);
      }
    }
  }

  private deleteAllEpochItems(epoch: Epoch): void {
    for (const hexRoot of this.epochIndex.get(epoch) || []) {
      this.cache.delete(hexRoot);
    }
    this.epochIndex.delete(epoch);
  }
}
