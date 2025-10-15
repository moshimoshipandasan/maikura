import { meshChunk } from './mesher';

type Req = { blocks: Uint8Array };
type Res = { positions: Float32Array; indices: Uint32Array; quads: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const { blocks } = e.data;
  const m = meshChunk(blocks);
  const msg: Res = { positions: m.positions, indices: m.indices, quads: m.quads };
  (self as unknown as Worker).postMessage(msg, [m.positions.buffer, m.indices.buffer]);
};

