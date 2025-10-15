export const CHUNK_SIZE = 16 as const;
export const CHUNK_HEIGHT = 128 as const;

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Wood = 4,
  Leaves = 5,
  Sand = 6,
  Water = 7,
}

export type ChunkKey = {
  seed: string;
  cx: number;
  cz: number;
};

export type ChunkData = {
  key: ChunkKey;
  // linear array length = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT
  blocks: Uint8Array;
};

export function inBounds(x: number, y: number, z: number): boolean {
  return (
    x >= 0 && x < CHUNK_SIZE &&
    y >= 0 && y < CHUNK_HEIGHT &&
    z >= 0 && z < CHUNK_SIZE
  );
}

export function offsetOf(x: number, y: number, z: number): number {
  if (!inBounds(x, y, z)) throw new RangeError('coords out of bounds');
  // layout: y-major or z-major? Choose y as middle: ((y * SIZE) + z) * SIZE + x
  return ((y * CHUNK_SIZE) + z) * CHUNK_SIZE + x;
}

export function coordsOf(offset: number): { x: number; y: number; z: number } {
  const strideYZ = CHUNK_SIZE * CHUNK_SIZE;
  if (offset < 0 || offset >= strideYZ * CHUNK_HEIGHT) throw new RangeError('offset out of bounds');
  const y = Math.floor(offset / (CHUNK_SIZE * CHUNK_SIZE));
  const rem = offset - y * CHUNK_SIZE * CHUNK_SIZE;
  const z = Math.floor(rem / CHUNK_SIZE);
  const x = rem - z * CHUNK_SIZE;
  return { x, y, z };
}

