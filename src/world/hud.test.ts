import { describe, it, expect } from 'vitest';
import { formatFps, formatCoords } from './hud';

describe('hud formatting', () => {
  it('formats fps to integer with label', () => {
    expect(formatFps(59.6)).toBe('FPS: 60');
  });
  it('formats coords with one decimal', () => {
    expect(formatCoords(1.234, 5.678, -9.01)).toBe('X:1.2 Y:5.7 Z:-9.0');
  });
});

