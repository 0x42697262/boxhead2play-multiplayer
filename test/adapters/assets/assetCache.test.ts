import { describe, expect, it } from 'vitest';
import { assetBaseOf, cacheFirst, isVersionedAsset, serviceWorkerUrl, type AssetCache } from '../../../src/adapters/assets/assetCache.ts';

const PAGE = 'https://game.example/play/';
const BASE = 'https://game.example/play/assets/';
const SVG_V1 = `${BASE}library/shapes/1.svg?v=aaaa`;
const SVG_V2 = `${BASE}library/shapes/1.svg?v=bbbb`;

class MemoryCache implements AssetCache {
  readonly entries = new Map<string, Response>();

  match(request: Request): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(request.url)?.clone());
  }

  put(request: Request, response: Response): Promise<void> {
    this.entries.set(request.url, response);
    return Promise.resolve();
  }

  keys(url: string): Promise<readonly Request[]> {
    return Promise.resolve([...this.entries.keys()].filter((key) => key.split('?')[0] === url).map((key) => new Request(key)));
  }

  delete(request: Request): Promise<boolean> {
    return Promise.resolve(this.entries.delete(request.url));
  }
}

function network(status = 200): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (input: RequestInfo | URL): Promise<Response> => {
    calls.push(input instanceof Request ? input.url : String(input));
    return Promise.resolve(new Response('<svg/>', { status }));
  };
  return { fetch: fetchImpl as typeof fetch, calls };
}

describe('asset service worker cache', () => {
  it('passes the asset base to the worker in its script URL', () => {
    const url = serviceWorkerUrl(`${PAGE}?join=ABCD`, 'assets/');
    expect(url.startsWith(`${PAGE}sw.js?`)).toBe(true);
    expect(assetBaseOf(url)).toBe(BASE);
  });

  it('handles only content-versioned files under the asset base', () => {
    expect(isVersionedAsset(SVG_V1, BASE)).toBe(true);
    expect(isVersionedAsset(`${BASE}manifest.json`, BASE)).toBe(false);
    expect(isVersionedAsset(`${PAGE}assets/index-abcdefgh.js`, `${PAGE}other/`)).toBe(false);
  });

  it('answers a refresh from the cache without touching the network', async () => {
    const cache = new MemoryCache();
    const first = network();
    await cacheFirst(new Request(SVG_V1), cache, first.fetch);
    const again = network();
    const response = await cacheFirst(new Request(SVG_V1), cache, again.fetch);
    expect(first.calls).toEqual([SVG_V1]);
    expect(again.calls).toEqual([]);
    expect(await response.text()).toBe('<svg/>');
  });

  it('replaces the old version of a file when a new extraction changes it', async () => {
    const cache = new MemoryCache();
    await cacheFirst(new Request(SVG_V1), cache, network().fetch);
    await cacheFirst(new Request(SVG_V2), cache, network().fetch);
    expect([...cache.entries.keys()]).toEqual([SVG_V2]);
  });

  it('does not keep errors', async () => {
    const cache = new MemoryCache();
    const response = await cacheFirst(new Request(SVG_V1), cache, network(404).fetch);
    expect(response.status).toBe(404);
    expect(cache.entries.size).toBe(0);
  });
});
