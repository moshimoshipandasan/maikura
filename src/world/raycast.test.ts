import { describe, it, expect } from 'vitest';
import { decideAction } from './raycast';

describe('raycast: decideAction', () => {
  it('rejects when not locked', () => {
    const res = decideAction({locked:false, maxDistance:8, intersects:[]});
    expect(res.type).toBe('none');
  });
  it('rejects when out of range', () => {
    const res = decideAction({locked:true, maxDistance:8, intersects:[{distance:9, objectId:1, faceNormal:[1,0,0]}]});
    expect(res.type).toBe('none');
  });
  it('accepts nearest in range and returns placement position', () => {
    const res = decideAction({locked:true, maxDistance:8, intersects:[
      {distance:7.5, objectId:1, faceNormal:[1,0,0], position:[0,0,0]},
      {distance:5.0, objectId:2, faceNormal:[0,1,0], position:[1,2,3]},
    ]});
    expect(res.type).toBe('hit');
    if (res.type !== 'hit') throw new Error('expected hit');
    expect(res.target.objectId).toBe(2);
  });
});

