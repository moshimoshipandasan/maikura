export function formatFps(fps: number): string {
    return `FPS: ${Math.round(fps)}`;
}

export function formatCoords(x: number, y: number, z: number): string {
    const f = (v: number) => v.toFixed(1).replace(/^-0\.0$/, '0.0');
    return `X:${f(x)} Y:${f(y)} Z:${f(z)}`;
}

export type HeartState = 'empty' | 'half' | 'full';

export function getHeartStates(health: number, maxHealth = 20): HeartState[] {
    const normalizedMax = Math.max(0, Math.floor(maxHealth));
    if (normalizedMax === 0) {
        return [];
    }
    const normalizedHealth = Math.max(0, Math.min(Math.floor(health), normalizedMax));
    const heartCount = Math.ceil(normalizedMax / 2);
    const result: HeartState[] = [];
    for (let i = 0; i < heartCount; i++) {
        const remaining = normalizedHealth - i * 2;
        if (remaining >= 2) {
            result.push('full');
        } else if (remaining === 1) {
            result.push('half');
        } else {
            result.push('empty');
        }
    }
    return result;
}

