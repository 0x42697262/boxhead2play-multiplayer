import { describe, expect, it } from 'vitest';
import { fetchAsset, isHtmlFallback, withTimeout } from '../../../src/adapters/assets/http.ts';
import { AppError, ErrorCode } from '../../../src/text/errors.ts';

function responding(body: string, init: ResponseInit): typeof fetch {
  return () => Promise.resolve(new Response(body, init));
}

async function errorCode(work: Promise<unknown>): Promise<ErrorCode | undefined> {
  try {
    await work;
  } catch (error) {
    return error instanceof AppError ? error.code : undefined;
  }
  return undefined;
}

describe('asset http', () => {
  it('recognizes the dev server HTML fallback by content type', () => {
    expect(isHtmlFallback('text/html')).toBe(true);
    expect(isHtmlFallback('Text/HTML; charset=utf-8')).toBe(true);
    expect(isHtmlFallback('image/svg+xml')).toBe(false);
    expect(isHtmlFallback(null)).toBe(false);
  });

  it('rejects a page served in place of an asset', async () => {
    const fetchImpl = responding('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    expect(await errorCode(fetchAsset('assets/library/morphs/569_0.svg', fetchImpl))).toBe(ErrorCode.AssetServedAsPage);
  });

  it('reports HTTP errors as missing assets and passes real assets through', async () => {
    expect(await errorCode(fetchAsset('a.svg', responding('', { status: 404 })))).toBe(ErrorCode.AssetMissing);
    const ok = await fetchAsset('a.svg', responding('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }));
    expect(await ok.text()).toBe('<svg/>');
  });

  it('gives up on work that never settles', async () => {
    const never = new Promise<never>(() => undefined);
    expect(await errorCode(withTimeout(never, 5, () => new AppError(ErrorCode.AssetTimedOut, 'x')))).toBe(ErrorCode.AssetTimedOut);
    expect(await withTimeout(Promise.resolve(3), 5, () => new AppError(ErrorCode.AssetTimedOut, 'x'))).toBe(3);
  });
});

describe('AssetLocator', () => {
  it('appends the content version of files the manifest lists', async () => {
    const { AssetLocator } = await import('../../../src/adapters/assets/urls.ts');
    const locator = new AssetLocator('assets/', [{ path: 'library/shapes/1.svg', sha256: 'abcdef0123456789ffff' }]);
    expect(locator.url('library/shapes/1.svg')).toBe('assets/library/shapes/1.svg?v=abcdef0123456789');
    expect(locator.entryUrl('library/symbols.json', 'shapes/1.svg')).toBe('assets/library/shapes/1.svg?v=abcdef0123456789');
    expect(locator.url('manifest.json')).toBe('assets/manifest.json');
  });
});
