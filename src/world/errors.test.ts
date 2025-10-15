import { describe, it, expect, vi } from 'vitest';
import { getErrorReporter, setErrorReporter, TimeoutError } from './errors';

describe('errors: reporter swap', () => {
  it('can swap reporter and call methods', () => {
    const logs: string[] = [];
    setErrorReporter({ warn: (m)=>logs.push('w:'+m), error:(m)=>logs.push('e:'+m), info:(m)=>logs.push('i:'+m) });
    getErrorReporter().warn('a');
    getErrorReporter().info('b');
    getErrorReporter().error('c');
    expect(logs).toEqual(['w:a','i:b','e:c']);
  });
});

