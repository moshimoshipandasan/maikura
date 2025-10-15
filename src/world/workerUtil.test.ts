import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from './workerUtil';
import { setErrorReporter } from './errors';

describe('workerUtil: withTimeout', () => {
  it('rejects with TimeoutError and warns', async () => {
    const logs: string[] = [];
    setErrorReporter({ warn: (m)=>logs.push('w:'+m), error:(m)=>logs.push('e:'+m), info:(m)=>logs.push('i:'+m) });
    const never = new Promise<void>(()=>{});
    await expect(withTimeout(never, 10, 'timeout!')).rejects.toThrow('Operation timed out');
    expect(logs).toContain('w:timeout!');
  });

  it('returns underlying promise value when resolves in time', async () => {
    const p = new Promise<number>(res => setTimeout(()=>res(42), 5));
    await expect(withTimeout(p, 50)).resolves.toBe(42);
  });
});

