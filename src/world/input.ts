export type MoveFlags = { forward:boolean; backward:boolean; left:boolean; right:boolean };

export function computeMoveDirection(flags: MoveFlags): { x:number; z:number } {
  const z = (flags.forward? -1:0) + (flags.backward? 1:0);
  const x = (flags.right? 1:0) + (flags.left? -1:0);
  const len = Math.hypot(x, z);
  if (len === 0) return { x: 0, z: 0 };
  return { x: x/len, z: z/len };
}

