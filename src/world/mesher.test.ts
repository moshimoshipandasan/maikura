import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, CHUNK_HEIGHT, BlockId } from './types';
import { meshChunk } from './mesher';

function makeBlocks(): Uint8Array {
  return new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
}

function idx(x: number, y: number, z: number) {
  return ((y * CHUNK_SIZE) + z) * CHUNK_SIZE + x;
}

describe('mesher: basic face culling', () => {
  it('empty chunk -> 0 quads', () => {
    const blocks = makeBlocks();
    const m = meshChunk(blocks);
    expect(m.quads).toBe(0);
    expect(m.positions.length).toBe(0);
    expect(m.indices.length).toBe(0);
  });

  it('single voxel -> 6 quads', () => {
    const blocks = makeBlocks();
    blocks[idx(0, 0, 0)] = BlockId.Stone;
    const m = meshChunk(blocks);
    expect(m.quads).toBe(6);
    expect(m.positions.length).toBe(6 * 4 * 3);
    expect(m.indices.length).toBe(6 * 6);
  });

  it('two adjacent voxels share internal face', () => {
    const blocks = makeBlocks();
    blocks[idx(0, 0, 0)] = BlockId.Stone;
    blocks[idx(1, 0, 0)] = BlockId.Stone;
    const m = meshChunk(blocks);
    // 2 voxels * 6 faces - 2 internal faces = 10
    expect(m.quads).toBe(10);
  });
});

