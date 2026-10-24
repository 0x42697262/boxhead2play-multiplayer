import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentVersion } from '../../../src/adapters/assets/urls.ts';
import { CachePolicy } from '../../../src/server/node/httpCaching.ts';
import { versionedAssetMiddleware } from '../../../src/server/node/versionedAssets.ts';

const FALLTHROUGH_STATUS = 299;
const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const version = contentVersion(createHash('sha256').update(svg).digest('hex'));
let root = '';
let server: Server;
let port = 0;

function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; cacheControl: string | undefined; etag: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, cacheControl: res.headers['cache-control'], etag: res.headers.etag }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'versioned-assets-'));
  mkdirSync(join(root, 'assets', 'shapes'), { recursive: true });
  writeFileSync(join(root, 'assets', 'shapes', '1.svg'), svg);
  const middleware = versionedAssetMiddleware(root);
  server = createServer((req, res) => middleware(req, res, () => res.writeHead(FALLTHROUGH_STATUS).end()));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

describe('dev server versioned assets', () => {
  it('serves an asset URL with its content version as immutable, so a reload takes it from the browser cache', async () => {
    const reply = await get(`/assets/shapes/1.svg?v=${version}`);
    expect(reply.status).toBe(200);
    expect(reply.cacheControl).toBe(CachePolicy.Immutable);
    expect((await get(`/assets/shapes/1.svg?v=${version}`, { 'if-none-match': reply.etag ?? '' })).status).toBe(304);
  });

  it('revalidates a stale version and leaves unversioned URLs to Vite', async () => {
    expect((await get('/assets/shapes/1.svg?v=0000000000000000')).cacheControl).toBe(CachePolicy.Revalidate);
    expect((await get('/assets/shapes/1.svg')).status).toBe(FALLTHROUGH_STATUS);
    expect((await get('/assets/manifest.json')).status).toBe(FALLTHROUGH_STATUS);
    expect((await get('/node_modules/.vite/deps/zod.js?v=34b489e6')).status).toBe(FALLTHROUGH_STATUS);
  });
});
