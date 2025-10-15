import type { MeshData } from './mesher';

export type RendererConfig = {
  dprMax: number;
};

export function capDevicePixelRatio(devicePixelRatio: number, dprMax: number): number {
  return Math.min(devicePixelRatio, dprMax);
}

export class Renderer {
  private config: RendererConfig;
  private stats = { quads: 0 };
  constructor(config: RendererConfig) {
    this.config = config;
  }
  registerMeshBuffers(m: MeshData) {
    this.stats.quads += m.quads;
  }
  getStats() { return { ...this.stats }; }
}

