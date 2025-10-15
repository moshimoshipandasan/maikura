import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE } from './types';
import { ChunkManager } from './chunkManager';

describe('ChunkManager', () => {
  it('computes needed chunks around player and enqueues requests', () => {
    const cm = new ChunkManager('s', 1);
    const res = cm.updatePlayerPosition(0, 0);
    // (2d+1)^2 = 9 requests expected initially
    expect(res.requests).toBe(9);
    // drain queue and mark as generated
    let r;
    const seen = new Set<string>();
    while ((r = cm.nextRequest())) {
      const key = `${r.cx},${r.cz}`;
      if (!seen.has(key)) {
        cm.onChunkGenerated({ key: { seed: r.seed, cx: r.cx, cz: r.cz }, blocks: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 128) });
        seen.add(key);
      }
    }
    expect(seen.size).toBe(9);
  });

  it('when moving to a new chunk, schedules new ones and unloads far ones', () => {
    const cm = new ChunkManager('s', 1);
    cm.updatePlayerPosition(0, 0);
    // simulate fulfilling initial requests
    let r;
    while ((r = cm.nextRequest())) {
      cm.onChunkGenerated({ key: { seed: r.seed, cx: r.cx, cz: r.cz }, blocks: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 128) });
    }
    // move to the next chunk on x
    const res2 = cm.updatePlayerPosition(CHUNK_SIZE * 1.1, 0);
    expect(res2.requests).toBeGreaterThan(0);
    // should unload at least one chunk that fell outside radius
    expect(res2.unload.length).toBeGreaterThan(0);
  });
});
