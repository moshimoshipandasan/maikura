// Thin worker wrapper around generateChunk() for runtime usage.
// Tests exercise the pure function in generator.ts.
import { generateChunk } from './generator';

type Req = { seed: string; cx: number; cz: number };
type Res = { seed: string; cx: number; cz: number; blocks: Uint8Array };

self.onmessage = (e: MessageEvent<Req>) => {
  const { seed, cx, cz } = e.data;
  const out = generateChunk(seed, cx, cz);
  const msg: Res = { seed, cx, cz, blocks: out.blocks };
  // transfer the underlying buffer to avoid copy
  (self as unknown as Worker).postMessage(msg, [out.blocks.buffer]);
};

