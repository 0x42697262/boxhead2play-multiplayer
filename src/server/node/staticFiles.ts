import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const INDEX_FILE = 'index.html';
const REQUEST_BASE = 'http://localhost';
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const ALLOWED_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);
const DEFAULT_TYPE = 'application/octet-stream';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export function resolveStaticPath(root: string, url: string): string | undefined {
  const pathname = decodeURIComponent(new URL(url, REQUEST_BASE).pathname);
  const relative = normalize(pathname).replace(/^([/\\])+/, '');
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, relative === '' ? INDEX_FILE : relative);
  return target === absoluteRoot || target.startsWith(absoluteRoot + sep) ? target : undefined;
}

export function staticFileHandler(root: string): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void serve(root, request, response);
  };
}

async function serve(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!ALLOWED_METHODS.has(request.method ?? '')) {
    response.writeHead(HTTP_METHOD_NOT_ALLOWED).end();
    return;
  }
  let path: string | undefined;
  try {
    path = resolveStaticPath(root, request.url ?? '/');
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
  response.writeHead(HTTP_OK, { 'content-type': CONTENT_TYPES[extname(target).toLowerCase()] ?? DEFAULT_TYPE, 'content-length': found.size });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(target).pipe(response);
}
