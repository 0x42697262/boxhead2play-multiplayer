import type { IncomingMessage, ServerResponse } from 'node:http';
import { VERSION_PARAM } from '../../adapters/assets/urls.ts';
import { staticFileHandler } from './staticFiles.ts';

export type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

const REQUEST_BASE = 'http://localhost';
const URL_SEPARATOR = '/';
const ASSET_PREFIX = '/assets/';

function versioned(url: string | undefined): boolean {
  try {
    const parsed = new URL(url ?? URL_SEPARATOR, REQUEST_BASE);
    return parsed.pathname.startsWith(ASSET_PREFIX) && parsed.searchParams.has(VERSION_PARAM);
  } catch {
    return false;
  }
}

export function versionedAssetMiddleware(root: string): Middleware {
  const serve = staticFileHandler(root);
  return (request, response, next) => {
    if (versioned(request.url)) serve(request, response);
    else next();
  };
}
