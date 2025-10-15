import { describe, it, expect } from 'vitest';
import { computeMoveDirection } from './input';

describe('input: computeMoveDirection', () => {
  it('computes normalized direction from WASD flags', () => {
    expect(computeMoveDirection({forward:true,backward:false,left:false,right:false})).toEqual({x:0,z:-1});
    expect(computeMoveDirection({forward:false,backward:true,left:false,right:false})).toEqual({x:0,z:1});
    expect(computeMoveDirection({forward:false,backward:false,left:true,right:false})).toEqual({x:-1,z:0});
    expect(computeMoveDirection({forward:false,backward:false,left:false,right:true})).toEqual({x:1,z:0});
    // diagonal
    const d = computeMoveDirection({forward:true,backward:false,left:true,right:false});
    expect(Math.hypot(d.x,d.z)).toBeCloseTo(1, 5);
  });
});

