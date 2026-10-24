import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { contentVersion, VERSION_PARAM } from '../../adapters/assets/urls.ts';
import { CachePolicy, chooseEncoding, etagMatches, isHashedBundle, type ContentEncoding } from './httpCaching.ts';

const INDEX_FILE = 'index.html';
const REQUEST_BASE = 'http://localhost';
const HTTP_OK = 200;
const HTTP_NOT_MODIFIED = 304;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const ALLOWED_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);
const DEFAULT_TYPE = 'application/octet-stream';
const ETAG_HEX_LENGTH = 32;
const URL_SEPARATOR = '/';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const ENCODING_SUFFIX: Readonly<Record<ContentEncoding, string>> = { br: '.br', gzip: '.gz' };

interface FileFacts {
  readonly key: string;
  readonly sha256: string;
  readonly variants: ReadonlyMap<ContentEncoding, number>;
}

export function resolveStaticPath(root: string, url: string): string | undefined {
  const pathname = decodeURIComponent(new URL(url, REQUEST_BASE).pathname);
  const relativePath = normalize(pathname).replace(/^([/\\])+/, '');
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, relativePath === '' ? INDEX_FILE : relativePath);
  return target === absoluteRoot || target.startsWith(absoluteRoot + sep) ? target : undefined;
}

async function variantSizes(target: string): Promise<ReadonlyMap<ContentEncoding, number>> {
  const variants = new Map<ContentEncoding, number>();
  for (const [encoding, suffix] of Object.entries(ENCODING_SUFFIX) as [ContentEncoding, string][]) {
    const found = await stat(`${target}${suffix}`).catch(() => undefined);
    if (found?.isFile()) variants.set(encoding, found.size);
  }
  return variants;
}

class FactsCache {
  private readonly facts = new Map<string, Promise<FileFacts>>();

  get(target: string, size: number, mtimeMs: number): Promise<FileFacts> {
    const key = `${size}:${mtimeMs}`;
    const cached = this.facts.get(target);
    if (cached) {
      return cached.then((facts) => (facts.key === key ? facts : this.load(target, key)));
    }
    return this.load(target, key);
  }

  private load(target: string, key: string): Promise<FileFacts> {
    const loading = (async () => ({
      key,
      sha256: createHash('sha256').update(await readFile(target)).digest('hex'),
      variants: await variantSizes(target),
    }))();
    this.facts.set(target, loading);
    loading.catch(() => this.facts.delete(target));
    return loading;
  }
}

export function staticFileHandler(root: string): (request: IncomingMessage, response: ServerResponse) => void {
  const cache = new FactsCache();
  return (request, response) => {
    void serve(root, cache, request, response);
  };
}

async function serve(root: string, cache: FactsCache, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!ALLOWED_METHODS.has(request.method ?? '')) {
    response.writeHead(HTTP_METHOD_NOT_ALLOWED).end();
    return;
  }
  let path: string | undefined;
  try {
    path = resolveStaticPath(root, request.url ?? URL_SEPARATOR);
  } catch {
    path = undefined;
  }
  const file = path ? await stat(path).catch(() => undefined) : undefined;
  const target = path && file?.isDirectory() ? join(path, INDEX_FILE) : path;
  const found = target ? await stat(target).catch(() => undefined) : undefined;
  if (!target || !found?.isFile()) {
    response.writeHead(HTTP_NOT_FOUND).end();
    return;
  }
  const facts = await cache.get(target, found.size, found.mtimeMs);
  const requestedVersion = new URL(request.url ?? URL_SEPARATOR, REQUEST_BASE).searchParams.get(VERSION_PARAM);
  const relativePath = relative(resolve(root), target).split(sep).join(URL_SEPARATOR);
  const immutable = requestedVersion === contentVersion(facts.sha256) || isHashedBundle(relativePath);
  const etag = `W/"${facts.sha256.slice(0, ETAG_HEX_LENGTH)}"`;
  const headers: Record<string, string | number> = {
    'content-type': CONTENT_TYPES[extname(target).toLowerCase()] ?? DEFAULT_TYPE,
    'cache-control': immutable ? CachePolicy.Immutable : CachePolicy.Revalidate,
    etag,
  };
  if (facts.variants.size > 0) headers.vary = 'accept-encoding';
  if (etagMatches(request.headers['if-none-match'], etag)) {
    response.writeHead(HTTP_NOT_MODIFIED, headers).end();
    return;
  }
  const encoding = chooseEncoding(request.headers['accept-encoding'], [...facts.variants.keys()]);
  const body = encoding === undefined ? target : `${target}${ENCODING_SUFFIX[encoding]}`;
  if (encoding !== undefined) headers['content-encoding'] = encoding;
  headers['content-length'] = encoding === undefined ? found.size : (facts.variants.get(encoding) ?? found.size);
  response.writeHead(HTTP_OK, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(body).pipe(response);
}
