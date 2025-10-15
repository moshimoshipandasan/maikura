import { CHUNK_HEIGHT, CHUNK_SIZE, BlockId } from './types';

function hashSeed(seed: string): number {
  // simple deterministic hash to number
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateChunk(seed: string, cx: number, cz: number) {
  const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
  const seedHash = hashSeed(seed) ^ (cx * 73856093) ^ (cz * 19349663);

  const base = 8; // base ground level
  const amp = 6;  // amplitude
  const period = 8; // wavelength factor

  const index = (x: number, y: number, z: number) => ((y * CHUNK_SIZE) + z) * CHUNK_SIZE + x;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const s = seedHash & 0xffff;
      const h = Math.max(1, Math.min(CHUNK_HEIGHT - 1,
        Math.floor(
          base + (
            Math.cos((wx + s) / period) * 4 +
            Math.sin((wz + (s >> 1)) / period) * 4
          ) * (amp / 8)
        )
      ));

      for (let y = 0; y < h; y++) {
        let id: BlockId = BlockId.Stone;
        if (y >= h - 1) id = BlockId.Grass;
        else if (y >= h - 4) id = BlockId.Dirt;
        blocks[index(x, y, z)] = id;
      }
      // above h remains Air (0)
    }
  }

  function get(x: number, y: number, z: number): BlockId {
    return blocks[index(x, y, z)] as BlockId;
  }

  return { blocks, get };
}

