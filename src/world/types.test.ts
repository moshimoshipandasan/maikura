import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, CHUNK_HEIGHT, BlockId, offsetOf, coordsOf, inBounds } from './types';

describe('types: dimensions and enums', () => {
  it('defines standard chunk dimensions', () => {
    expect(CHUNK_SIZE).toBe(16);
    expect(CHUNK_HEIGHT).toBe(128);
  });

  it('BlockId enum has expected values', () => {
    expect(BlockId.Air).toBe(0);
    expect(BlockId.Grass).toBe(1);
    expect(BlockId.Dirt).toBe(2);
    expect(BlockId.Stone).toBe(3);
  });
});

describe('types: index conversions', () => {
  it('converts (x,y,z) to linear offset and back', () => {
    const x = 5, y = 7, z = 9;
    const off = offsetOf(x, y, z);
    const c = coordsOf(off);
    expect(c.x).toBe(x);
    expect(c.y).toBe(y);
    expect(c.z).toBe(z);
  });

  it('inBounds reports correctly', () => {
    expect(inBounds(0, 0, 0)).toBe(true);
    expect(inBounds(CHUNK_SIZE-1, CHUNK_HEIGHT-1, CHUNK_SIZE-1)).toBe(true);
    expect(inBounds(-1, 0, 0)).toBe(false);
    expect(inBounds(0, CHUNK_HEIGHT, 0)).toBe(false);
    expect(inBounds(0, 0, CHUNK_SIZE)).toBe(false);
  });
});
