import { describe, it, expect } from 'vitest';
import { BrowserIdbStore, makeKey } from './store';
import { setErrorReporter } from './errors';
import { BlockId, type ChunkKey } from './types';

describe('store: BrowserIdbStore fallback warning', () => {
  it('warns and falls back when indexedDB is unavailable', async () => {
    const logs: string[] = [];
    setErrorReporter({ warn: (m)=>logs.push('w:'+m), error:()=>{}, info:()=>{} });
    const store = new BrowserIdbStore();
    const key: ChunkKey = { seed:'s', cx:0, cz:0 };
    const k = makeKey(key);
    await store.saveDelta(k, [ { offset: 1, id: BlockId.Dirt } ]);
    const got = await store.loadDelta(k);
    expect(got).toEqual([ { offset: 1, id: BlockId.Dirt } ]);
    expect(logs.find(l=>l.startsWith('w:IndexedDB is unavailable'))).toBeTruthy();
  });
});

