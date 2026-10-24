import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentVersion } from '../../../src/adapters/assets/urls.ts';
import { CachePolicy } from '../../../src/server/node/httpCaching.ts';
import { staticFileHandler } from '../../../src/server/node/staticFiles.ts';

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Buffer;
}

const symbolsJson = JSON.stringify({ shapes: 'x'.repeat(4000) });
const symbolsSha = createHash('sha256').update(symbolsJson).digest('hex');
let root = '';
let server: Server;
let port = 0;

function get(path: string, headers: Record<string, string> = {}, method = 'GET'): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'static-files-'));
  mkdirSync(join(root, 'assets', 'library'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'assets', 'index-BVrz_ycd.js'), 'console.log(1)');
  writeFileSync(join(root, 'assets', 'library', 'symbols.json'), symbolsJson);
  writeFileSync(join(root, 'assets', 'library', 'symbols.json.gz'), gzipSync(symbolsJson));
  server = createServer(staticFileHandler(root));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
});

describe('static file caching', () => {
  it('makes a content-versioned URL immutable', async () => {
    const reply = await get(`/assets/library/symbols.json?v=${contentVersion(symbolsSha)}`);
    expect(reply.status).toBe(200);
    expect(reply.headers['cache-control']).toBe(CachePolicy.Immutable);
    expect(reply.headers.etag).toBe(`W/"${symbolsSha.slice(0, 32)}"`);
  });

  it('revalidates unversioned, wrongly versioned and HTML resources', async () => {
    for (const path of ['/assets/library/symbols.json', '/assets/library/symbols.json?v=0000000000000000', '/']) {
      expect((await get(path)).headers['cache-control']).toBe(CachePolicy.Revalidate);
    }
  });

  it('keeps Vite bundles with a content hash in their name forever', async () => {
    expect((await get('/assets/index-BVrz_ycd.js')).headers['cache-control']).toBe(CachePolicy.Immutable);
  });

  it('answers a matching If-None-Match with 304 and no body', async () => {
    const first = await get('/');
    const second = await get('/', { 'if-none-match': String(first.headers.etag) });
    expect(second.status).toBe(304);
    expect(second.body.length).toBe(0);
    expect(second.headers.etag).toBe(first.headers.etag);
  });

  it('serves the precompressed variant the client accepts', async () => {
    const compressed = await get('/assets/library/symbols.json', { 'accept-encoding': 'gzip, br' });
    expect(compressed.headers['content-encoding']).toBe('gzip');
    expect(compressed.headers.vary).toBe('accept-encoding');
    expect(Number(compressed.headers['content-length'])).toBe(compressed.body.length);
    expect(compressed.body.length).toBeLessThan(symbolsJson.length);
    const plain = await get('/assets/library/symbols.json');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString()).toBe(symbolsJson);
  });

  it('answers HEAD with headers only and rejects other methods', async () => {
    const head = await get('/', {}, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect((await get('/', {}, 'POST')).status).toBe(405);
    expect((await get('/missing.json')).status).toBe(404);
  });
});
