export function formatFps(fps: number): string {
  return `FPS: ${Math.round(fps)}`;
}

export function formatCoords(x: number, y: number, z: number): string {
  const f = (v: number) => v.toFixed(1).replace(/^-0\.0$/, '0.0');
  return `X:${f(x)} Y:${f(y)} Z:${f(z)}`;
}

