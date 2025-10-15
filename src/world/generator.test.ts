import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, CHUNK_HEIGHT, BlockId } from './types';
import { generateChunk } from './generator';

describe('generator: generateChunk', () => {
  it('returns a filled Uint8Array with correct length', () => {
    const g = generateChunk('seed1', 0, 0);
    expect(g.blocks).toBeInstanceOf(Uint8Array);
    expect(g.blocks.length).toBe(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
  });

  it('creates ground with grass top and dirt/stone below', () => {
    const g = generateChunk('seed1', 0, 0);
    // sample a few columns
    for (let x = 0; x < CHUNK_SIZE; x += 5) {
      for (let z = 0; z < CHUNK_SIZE; z += 7) {
        // find topmost non-air block
        let topY = -1;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          const id = g.get(x, y, z);
          if (id !== BlockId.Air) { topY = y; break; }
        }
        expect(topY).toBeGreaterThanOrEqual(0);
        expect(g.get(x, topY, z)).toBe(BlockId.Grass);
        if (topY - 1 >= 0) {
          const below = g.get(x, topY - 1, z);
          expect([BlockId.Dirt, BlockId.Stone]).toContain(below);
        }
      }
    }
  });

  it('is deterministic for same seed and coords', () => {
    const a = generateChunk('seedX', 1, 2).blocks;
    const b = generateChunk('seedX', 1, 2).blocks;
    expect(Buffer.from(a)).toEqual(Buffer.from(b));
  });
});

