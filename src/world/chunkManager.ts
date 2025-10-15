import { CHUNK_SIZE, type ChunkKey, type ChunkData } from './types';

export type GenerationRequest = { seed: string; cx: number; cz: number };

export class ChunkManager {
  readonly seed: string;
  renderDistance: number; // in chunks (Chebyshev radius)

  private loaded = new Set<string>();
  private pending = new Set<string>();
  private queue: GenerationRequest[] = [];
  private lastPlayerChunk: { cx: number; cz: number } | null = null;
  private lastNeeded = new Set<string>();

  constructor(seed: string, renderDistance: number) {
    this.seed = seed;
    this.renderDistance = Math.max(0, Math.floor(renderDistance));
  }

  static worldToChunk(x: number, z: number): { cx: number; cz: number } {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return { cx, cz };
  }

  updatePlayerPosition(worldX: number, worldZ: number): { requests: number; unload: string[] } {
    const { cx, cz } = ChunkManager.worldToChunk(worldX, worldZ);
    if (this.lastPlayerChunk && this.lastPlayerChunk.cx === cx && this.lastPlayerChunk.cz === cz) {
      return { requests: 0, unload: [] };
    }
    this.lastPlayerChunk = { cx, cz };
    const needed = this.computeNeeded(cx, cz, this.renderDistance);
    const needSet = new Set(needed.map(k => this.keyOf(k.cx, k.cz)));

    const unload: string[] = [];
    // schedule new requests
    for (const { cx: nx, cz: nz } of needed) {
      const k = this.keyOf(nx, nz);
      if (!this.loaded.has(k) && !this.pending.has(k)) {
        const req: GenerationRequest = { seed: this.seed, cx: nx, cz: nz };
        this.queue.push(req);
        this.pending.add(k);
      }
    }
    // unload chunks that are no longer needed
    for (const k of this.loaded) {
      if (!needSet.has(k)) unload.push(k);
    }
    this.lastNeeded = needSet;
    return { requests: this.queue.length, unload };
  }

  nextRequest(): GenerationRequest | null {
    return this.queue.shift() ?? null;
  }

  onChunkGenerated(data: ChunkData): void {
    const k = this.keyOf(data.key.cx, data.key.cz);
    this.pending.delete(k);
    this.loaded.add(k);
  }

  onChunkUnloaded(cx: number, cz: number): void {
    const k = this.keyOf(cx, cz);
    this.loaded.delete(k);
  }

  private keyOf(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private computeNeeded(cx: number, cz: number, dist: number): { cx: number; cz: number }[] {
    const out: { cx: number; cz: number }[] = [];
    for (let dz = -dist; dz <= dist; dz++) {
      for (let dx = -dist; dx <= dist; dx++) {
        out.push({ cx: cx + dx, cz: cz + dz });
      }
    }
    // sort by distance to prioritize nearer chunks
    out.sort((a, b) => Math.max(Math.abs(a.cx - cx), Math.abs(a.cz - cz)) - Math.max(Math.abs(b.cx - cx), Math.abs(b.cz - cz)));
    return out;
  }
}

