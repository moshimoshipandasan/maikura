import type { ChunkKey, BlockId } from './types';
import { getErrorReporter } from './errors';

export type BlockDelta = { offset: number; id: BlockId };

export function makeKey(k: ChunkKey): string {
  return `world:${k.seed}:${k.cx}:${k.cz}`;
}

export interface DeltaStore {
  loadDelta(key: string): Promise<BlockDelta[] | null>;
  saveDelta(key: string, deltas: BlockDelta[]): Promise<void>;
  clearWorld(seed: string): Promise<void>;
}

export class MemoryStore implements DeltaStore {
  private map = new Map<string, BlockDelta[]>();
  async loadDelta(key: string): Promise<BlockDelta[] | null> {
    return this.map.get(key) ?? null;
  }
  async saveDelta(key: string, deltas: BlockDelta[]): Promise<void> {
    this.map.set(key, deltas);
  }
  async clearWorld(seed: string): Promise<void> {
    const prefix = `world:${seed}:`;
    for (const k of Array.from(this.map.keys())) {
      if (k.startsWith(prefix)) this.map.delete(k);
    }
  }
}

// TODO: IndexedDB-backed store（ブラウザ環境で有効化）
export class BrowserIdbStore implements DeltaStore {
  private memory = new MemoryStore();
  private readonly hasIdb = typeof indexedDB !== 'undefined';
  async loadDelta(key: string): Promise<BlockDelta[] | null> {
    if (!this.hasIdb) {
      getErrorReporter().warn('IndexedDB is unavailable, using in-memory store.');
      return this.memory.loadDelta(key);
    }
    // Placeholder: implement real IDB later
    return this.memory.loadDelta(key);
  }
  async saveDelta(key: string, deltas: BlockDelta[]): Promise<void> {
    if (!this.hasIdb) {
      getErrorReporter().warn('IndexedDB is unavailable, using in-memory store.');
      return this.memory.saveDelta(key, deltas);
    }
    return this.memory.saveDelta(key, deltas);
  }
  async clearWorld(seed: string): Promise<void> {
    if (!this.hasIdb) {
      getErrorReporter().warn('IndexedDB is unavailable, using in-memory store.');
      return this.memory.clearWorld(seed);
    }
    return this.memory.clearWorld(seed);
  }
}

