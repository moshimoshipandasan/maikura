export type Intersect = {
  distance: number;
  objectId: number;
  faceNormal: [number, number, number];
  position?: [number, number, number];
};

export function decideAction({ locked, maxDistance, intersects }:
  { locked: boolean; maxDistance: number; intersects: Intersect[] })
  : { type: 'none' } | { type: 'hit'; target: Intersect } {
  if (!locked) return { type: 'none' };
  const inRange = intersects.filter(i => i.distance <= maxDistance);
  if (inRange.length === 0) return { type: 'none' };
  inRange.sort((a,b)=>a.distance-b.distance);
  return { type: 'hit', target: inRange[0] };
}

