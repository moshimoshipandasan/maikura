import { CHUNK_SIZE, CHUNK_HEIGHT, BlockId } from './types';

const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

const FACE_VERTS: Record<string, readonly [number, number, number][]> = {
  // unit cube faces using min-corner (x,y,z)
  '1,0,0': [
    [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1],
  ],
  '-1,0,0': [
    [0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0],
  ],
  '0,1,0': [
    [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1],
  ],
  '0,-1,0': [
    [0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0],
  ],
  '0,0,1': [
    [0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1],
  ],
  '0,0,-1': [
    [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0],
  ],
};

function index(x: number, y: number, z: number): number {
  return ((y * CHUNK_SIZE) + z) * CHUNK_SIZE + x;
}

function isSolid(id: number): boolean {
  return id !== BlockId.Air; // 水などの透過は将来拡張
}

export type MeshData = {
  positions: Float32Array;
  indices: Uint32Array;
  quads: number;
};

export function meshChunk(blocks: Uint8Array): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  let quadCount = 0;

  const pushFace = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
    const key = `${dx},${dy},${dz}`;
    const baseIndex = positions.length / 3;
    for (const v of FACE_VERTS[key]) {
      positions.push(x + v[0], y + v[1], z + v[2]);
    }
    indices.push(
      baseIndex + 0, baseIndex + 1, baseIndex + 2,
      baseIndex + 0, baseIndex + 2, baseIndex + 3,
    );
    quadCount++;
  };

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = blocks[index(x, y, z)];
        if (!isSolid(id)) continue;
        for (const [dx, dy, dz] of DIRS) {
          const nx = x + dx, ny = y + dy, nz = z + dz;
          let neighborSolid = false;
          if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
            neighborSolid = isSolid(blocks[index(nx, ny, nz)]);
          } else {
            neighborSolid = false; // 外側は空気
          }
          if (!neighborSolid) pushFace(x, y, z, dx, dy, dz);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    quads: quadCount,
  };
}

