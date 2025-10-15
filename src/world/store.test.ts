import { describe, it, expect } from 'vitest';
import { type ChunkKey, BlockId } from './types';
import { makeKey, MemoryStore } from './store';

describe('store: memory fallback', () => {
  const key: ChunkKey = { seed: 's', cx: 0, cz: 0 };
  const store = new MemoryStore();

  it('saves and loads deltas', async () => {
    const k = makeKey(key);
    await store.saveDelta(k, [ { offset: 1, id: BlockId.Grass } ]);
    const got = await store.loadDelta(k);
    expect(got).toEqual([ { offset: 1, id: BlockId.Grass } ]);
  });

  it('clears world namespace', async () => {
    const k1 = makeKey({ seed: 'a', cx: 0, cz: 0 });
    const k2 = makeKey({ seed: 'a', cx: 1, cz: 0 });
    await store.saveDelta(k1, []);
    await store.saveDelta(k2, []);
    await store.clearWorld('a');
    expect(await store.loadDelta(k1)).toBeNull();
    expect(await store.loadDelta(k2)).toBeNull();
  });
});
