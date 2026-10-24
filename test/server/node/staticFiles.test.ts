import { createHash } from 'node:crypto';
import type * as FileSystem from 'node:fs';
import type * as FileSystemPromises from 'node:fs/promises';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath, sep } from 'node:path';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { contentVersion } from '../../../src/adapters/assets/urls.ts';
import { CachePolicy } from '../../../src/server/node/httpCaching.ts';
import { resolveStaticPath, staticFileHandler } from '../../../src/server/node/staticFiles.ts';

const failures = vi.hoisted(() => ({ read: false, hash: false }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  const failingStream = (): Readable =>
    new Readable({
      read() {
        this.destroy(new Error('read failed'));
      },
    });
  return { ...actual, createReadStream: (...args: Parameters<typeof actual.createReadStream>) => (failures.read ? failingStream() : actual.createReadStream(...args)) };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystemPromises>();
  return { ...actual, readFile: (...args: Parameters<typeof actual.readFile>) => (failures.hash ? Promise.reject(new Error('hash failed')) : actual.readFile(...args)) };
});

type Outcome = 'complete' | 'aborted';

function outcome(path: string): Promise<Outcome> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      res.on('error', () => resolve('aborted'));
      res.on('aborted', () => resolve('aborted'));
      res.on('end', () => resolve(res.complete ? 'complete' : 'aborted'));
      res.resume();
    });
    req.on('error', () => resolve('aborted'));
    req.end();
  });
}

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Buffer;
}

const SECRET = 'outside the root';
const SECRET_FILE = 'secret.txt';
const TRAVERSALS: readonly string[] = [
  `/../${SECRET_FILE}`,
  `/%2e%2e/${SECRET_FILE}`,
  `/%2E%2E%2F${SECRET_FILE}`,
  `/..%2f${SECRET_FILE}`,
  `/..%2f..%2f${SECRET_FILE}`,
  `/..%5c${SECRET_FILE}`,
  `/..%5c..%5c${SECRET_FILE}`,
  `//..%2f${SECRET_FILE}`,
  `/assets/..%2f..%2f..%2f${SECRET_FILE}`,
];
const UNREADABLE: readonly string[] = ['/index.html%00', '/%00', '/%', '/%E0%A4%A', '/%zz', '//['];
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
  const parent = mkdtempSync(join(tmpdir(), 'static-files-'));
  writeFileSync(join(parent, SECRET_FILE), SECRET);
  root = join(parent, 'public');
  mkdirSync(join(root, 'assets', 'library'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'assets', 'index-BVrz_ycd.js'), 'console.log(1)');
  writeFileSync(join(root, 'assets', 'library', 'symbols.json'), symbolsJson);
  writeFileSync(join(root, 'assets', 'library', 'symbols.json.gz'), gzipSync(symbolsJson));
  writeFileSync(join(root, 'broken.json'), symbolsJson);
  server = createServer(staticFileHandler(root));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(join(root, '..'), { recursive: true, force: true });
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

describe('static path traversal', () => {
  const base = resolvePath('/srv/www');

  it.each(TRAVERSALS)('keeps %s inside the root', (url) => {
    const target = resolveStaticPath(base, url);
    expect(target === undefined || target.startsWith(base + sep)).toBe(true);
  });

  it.each(UNREADABLE)('resolves %s to nothing', (url) => {
    expect(resolveStaticPath(base, url)).toBeUndefined();
  });

  it.each([...TRAVERSALS, ...UNREADABLE])('answers %s with 404', async (url) => {
    const reply = await get(url);
    expect(reply.status).toBe(404);
    expect(reply.body.toString()).not.toContain(SECRET);
  });
});

describe('static file failures', () => {
  it('cuts the response off when reading the file fails after the headers went out, and keeps serving', async () => {
    failures.read = true;
    try {
      expect(await outcome('/assets/library/symbols.json')).toBe('aborted');
    } finally {
      failures.read = false;
    }
    expect(await outcome('/assets/library/symbols.json')).toBe('complete');
  });

  it('answers 500 when the file facts cannot be read', async () => {
    failures.hash = true;
    try {
      expect((await get('/broken.json')).status).toBe(500);
    } finally {
      failures.hash = false;
    }
    expect((await get('/broken.json')).status).toBe(200);
  });
});
