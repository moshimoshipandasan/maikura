import { preview } from "vite";
const server = await preview({ root: '.', preview: { port: 4173, host: '127.0.0.1', strictPort: true } });
console.log('PREVIEW_READY');
setTimeout(() => {
  server.close();
  console.log('PREVIEW_STOP');
}, 60000);
await new Promise(() => {});
