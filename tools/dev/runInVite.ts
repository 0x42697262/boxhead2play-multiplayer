import { createServer } from 'vite';

const script = process.argv[2];
if (!script) throw new Error('usage: node tools/dev/runInVite.ts <script.ts>');
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  await server.ssrLoadModule(`/${script}`);
} finally {
  await server.close();
}
