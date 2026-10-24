import { VERSION_PARAM } from './urls.ts';

export const SERVICE_WORKER_FILE = 'sw.js';
export const ASSET_BASE_PARAM = 'assets';
export const ASSET_CACHE_NAME = 'boxhead-assets-v1';

const HTTP_OK = 200;

export interface AssetCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  keys(request: string, options: CacheQueryOptions): Promise<readonly Request[]>;
  delete(request: Request): Promise<boolean>;
}

export function serviceWorkerUrl(pageUrl: string, assetBaseUrl: string): string {
  const worker = new URL(SERVICE_WORKER_FILE, pageUrl);
  worker.searchParams.set(ASSET_BASE_PARAM, new URL(assetBaseUrl, pageUrl).href);
  return worker.href;
}

export function assetBaseOf(workerUrl: string): string | undefined {
  return new URL(workerUrl).searchParams.get(ASSET_BASE_PARAM) ?? undefined;
}

export function isVersionedAsset(url: string, assetBase: string): boolean {
  return url.startsWith(assetBase) && new URL(url).searchParams.has(VERSION_PARAM);
}

function unversioned(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.href;
}

export async function cacheFirst(request: Request, cache: AssetCache, fetchImpl: typeof fetch): Promise<Response> {
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetchImpl(request);
  if (response.status !== HTTP_OK) return response;
  for (const stale of await cache.keys(unversioned(request.url), { ignoreSearch: true })) await cache.delete(stale);
  await cache.put(request, response.clone());
  return response;
}
