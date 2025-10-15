import { TimeoutError, getErrorReporter } from './errors';

export async function withTimeout<T>(p: Promise<T>, ms: number, onTimeoutMsg?: string): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => {
      if (onTimeoutMsg) getErrorReporter().warn(onTimeoutMsg);
      reject(new TimeoutError());
    }, ms);
  });
  try {
    const res = await Promise.race([p, timeout]);
    return res as T;
  } finally {
    clearTimeout(t);
  }
}

