import { ASSET_CACHE_NAME, assetBaseOf, cacheFirst, isVersionedAsset } from '../adapters/assets/assetCache.ts';

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends Event {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface WorkerScope {
  readonly location: Location;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
}

const GET = 'GET';
const worker = globalThis as unknown as WorkerScope;
const assetBase = assetBaseOf(worker.location.href);

async function serve(request: Request): Promise<Response> {
  try {
    return await cacheFirst(request, await caches.open(ASSET_CACHE_NAME), fetch);
  } catch {
    return fetch(request);
  }
}

worker.addEventListener('install', (event) => event.waitUntil(worker.skipWaiting()));
worker.addEventListener('activate', (event) => event.waitUntil(worker.clients.claim()));
worker.addEventListener('fetch', (event) => {
  if (assetBase === undefined || event.request.method !== GET || !isVersionedAsset(event.request.url, assetBase)) return;
  event.respondWith(serve(event.request));
});
