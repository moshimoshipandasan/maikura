import { describe, it, expect } from 'vitest';
import { capDevicePixelRatio, Renderer } from './renderer';
import { meshChunk } from './mesher';

describe('renderer: DPR cap', () => {
  it('caps devicePixelRatio by max', () => {
    expect(capDevicePixelRatio(3, 2)).toBe(2);
    expect(capDevicePixelRatio(1.5, 2)).toBe(1.5);
  });
});

describe('renderer: mesh registration stats', () => {
  it('tracks number of quads registered', () => {
    const r = new Renderer({ dprMax: 2 });
    const blocks = new Uint8Array(16*16*128);
    blocks[0] = 3; // one voxel
    const m = meshChunk(blocks);
    r.registerMeshBuffers(m);
    expect(r.getStats().quads).toBe(m.quads);
  });
});

