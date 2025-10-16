import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, CHUNK_HEIGHT, BlockId } from './types';
import { generateChunk } from './generator';

const OBSIDIAN_DEPTH = 3;

describe('generator: generateChunk', () => {
  it('returns a filled Uint8Array with correct length', () => {
    const g = generateChunk('seed1', 0, 0);
    expect(g.blocks.length).toBe(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
  });

  it('lays obsidian foundation and forms biomes without magma-water adjacency', () => {
    const g = generateChunk('seed1', 0, 0);

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let y = 0; y < OBSIDIAN_DEPTH; y++) {
          expect(g.get(x, y, z)).toBe(BlockId.Obsidian);
        }
      }
    }

    const dirs = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
    ] as const;

    for (let y = OBSIDIAN_DEPTH; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (g.get(x, y, z) !== BlockId.Magma) continue;
          for (const [dx, dy, dz] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE || ny < 0 || ny >= CHUNK_HEIGHT) continue;
            expect(g.get(nx, ny, nz)).not.toBe(BlockId.Water);
          }
        }
      }
    }

    for (let y = OBSIDIAN_DEPTH + 1; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          if (g.get(x, y, z) === BlockId.Water) {
            expect(g.get(x, y - 1, z)).not.toBe(BlockId.Air);
          }
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
