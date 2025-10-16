import { CHUNK_HEIGHT, CHUNK_SIZE, BlockId } from './types';

type Biome = 'plains' | 'hills' | 'desert' | 'ocean';

const OBSIDIAN_DEPTH = 3;
const SEA_LEVEL = 28;

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand2(seed: number, x: number, z: number): number {
  let v = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  v = (v ^ (v >>> 13)) * 1274126177;
  return (v ^ (v >>> 16)) >>> 0;
}

function smoothNoise(seed: number, x: number, z: number): number {
  const xf = x / 32;
  const zf = z / 32;
  const xi = Math.floor(xf);
  const zi = Math.floor(zf);
  const tx = xf - xi;
  const tz = zf - zi;

  const n00 = rand2(seed, xi, zi) & 0xffff;
  const n10 = rand2(seed, xi + 1, zi) & 0xffff;
  const n01 = rand2(seed, xi, zi + 1) & 0xffff;
  const n11 = rand2(seed, xi + 1, zi + 1) & 0xffff;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const nx0 = lerp(n00, n10, tx);
  const nx1 = lerp(n01, n11, tx);
  return lerp(nx0, nx1, tz) / 0xffff;
}

function pickBiome(seed: number, wx: number, wz: number): Biome {
  const tempNoise = smoothNoise(seed ^ 0x9e3779b9, wx, wz);
  const heightNoise = smoothNoise(seed ^ 0x6a09e667, wx * 0.5, wz * 0.5);
  if (heightNoise < 0.35) return 'ocean';
  if (tempNoise > 0.7) return 'desert';
  if (heightNoise > 0.75) return 'hills';
  return 'plains';
}

function biomeHeight(biome: Biome, base: number, noise: number): number {
  switch (biome) {
    case 'ocean': return base - 8 + noise * 6;
    case 'desert': return base + 2 + noise * 4;
    case 'hills': return base + 6 + noise * 10;
    case 'plains':
    default: return base + noise * 6;
  }
}

export function generateChunk(seed: string, cx: number, cz: number) {
  const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
  const seedHash = hashSeed(seed);
  const index = (x: number, y: number, z: number) => ((y * CHUNK_SIZE) + z) * CHUNK_SIZE + x;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const biome = pickBiome(seedHash, wx, wz);
      const baseHeight = SEA_LEVEL - 4;
      const noise = smoothNoise(seedHash ^ 0x510e527f, wx * 4, wz * 4) - 0.5;
      const columnHeight = Math.max(OBSIDIAN_DEPTH + 2,
        Math.min(CHUNK_HEIGHT - 8, Math.round(biomeHeight(biome, baseHeight, noise * 12))));

      for (let y = 0; y < OBSIDIAN_DEPTH; y++) {
        blocks[index(x, y, z)] = BlockId.Obsidian;
      }

      const magmaSeed = rand2(seedHash ^ 0x7f4a7c15, wx, wz) / 0xffffffff;
      if (magmaSeed < 0.1 && biome !== 'ocean') {
        const magmaHeight = OBSIDIAN_DEPTH + 3 + Math.floor(magmaSeed * 6);
        for (let y = OBSIDIAN_DEPTH; y < Math.min(magmaHeight, columnHeight - 2); y++) {
          blocks[index(x, y, z)] = BlockId.Magma;
        }
      }

      for (let y = OBSIDIAN_DEPTH; y < columnHeight; y++) {
        if (blocks[index(x, y, z)] === BlockId.Magma) continue;
        let block = BlockId.Stone;
        if (y >= columnHeight - 1) {
          block = biome === 'desert' ? BlockId.Sand : BlockId.Grass;
        } else if (y >= columnHeight - 4) {
          block = biome === 'desert' ? BlockId.Sand : BlockId.Dirt;
        }
        blocks[index(x, y, z)] = block;
      }

      if (columnHeight < SEA_LEVEL) {
        for (let y = columnHeight; y <= SEA_LEVEL; y++) {
          blocks[index(x, y, z)] = BlockId.Water;
        }
      }
    }
  }

  // allow water to fall through air pockets
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let highestWater = -1;
      for (let y = SEA_LEVEL; y >= OBSIDIAN_DEPTH; y--) {
        if (blocks[index(x, y, z)] === BlockId.Water) {
          highestWater = y;
          break;
        }
      }
      if (highestWater === -1) continue;
      for (let y = highestWater - 1; y >= OBSIDIAN_DEPTH; y--) {
        const current = blocks[index(x, y, z)];
        if (current === BlockId.Air) {
          blocks[index(x, y, z)] = BlockId.Water;
          continue;
        }
        if (current === BlockId.Magma) {
          break;
        }
        break;
      }
    }
  }

  for (let y = OBSIDIAN_DEPTH; y <= SEA_LEVEL + 2; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        if (blocks[index(x, y, z)] !== BlockId.Magma) continue;
        for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE || ny < 0 || ny >= CHUNK_HEIGHT) continue;
          if (blocks[index(nx, ny, nz)] === BlockId.Water) {
            blocks[index(x, y, z)] = BlockId.Obsidian;
            break;
          }
        }
      }
    }
  }

  const get = (x: number, y: number, z: number): BlockId => blocks[index(x, y, z)] as BlockId;
  return { blocks, get };
}
