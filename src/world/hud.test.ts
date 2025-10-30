import { describe, it, expect } from 'vitest';
import { formatFps, formatCoords, getHeartStates } from './hud';

describe('hud formatting', () => {
    it('formats fps to integer with label', () => {
        expect(formatFps(59.6)).toBe('FPS: 60');
    });
    it('formats coords with one decimal', () => {
        expect(formatCoords(1.234, 5.678, -9.01)).toBe('X:1.2 Y:5.7 Z:-9.0');
    });
});

describe('getHeartStates', () => {
    it('returns full hearts when health is max', () => {
        expect(getHeartStates(20, 20)).toEqual(Array(10).fill('full'));
    });

    it('handles half heart correctly', () => {
        expect(getHeartStates(15, 20)).toEqual([
            'full', 'full', 'full', 'full', 'full',
            'full', 'full', 'half', 'empty', 'empty',
        ]);
    });

    it('returns empty when max health is zero', () => {
        expect(getHeartStates(10, 0)).toEqual([]);
    });
});

