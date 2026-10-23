import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchValidated, loadCatalogs, mapLimited, type Fetcher } from '../../../src/adapters/assets/AssetLoader.ts';
import { graphicPaths, stretchToViewport } from '../../../src/adapters/assets/GraphicImages.ts';
import { ManifestSchema } from '../../../src/adapters/assets/schemas.ts';
import { LoadPhase, type LoadProgress } from '../../../src/adapters/assets/tuning.ts';
import { catalogEntryUrl, directoryOf, joinUrl } from '../../../src/adapters/assets/urls.ts';
import { AppError, ErrorCode } from '../../../src/text/errors.ts';
import { ASSET_ROOT, assetsMissing, assetSymbols } from './support.ts';

const BASE = 'assets/';

function diskFetcher(): Fetcher & { readonly requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    json: (url) => {
      requested.push(url);
      return Promise.resolve(JSON.parse(readFileSync(path.join(ASSET_ROOT, url.slice(BASE.length)), 'utf8')) as unknown);
    },
    bytes: () => Promise.reject(new Error('unused')),
  };
}

describe('asset urls', () => {
  it('resolve entries relative to their catalog directory', () => {
    expect(directoryOf('library/symbols.json')).toBe('library/');
    expect(directoryOf('manifest.json')).toBe('');
    expect(joinUrl('assets', 'x.json')).toBe('assets/x.json');
    expect(catalogEntryUrl('assets/', 'library/symbols.json', 'shapes/1.svg')).toBe('assets/library/shapes/1.svg');
  });
});

describe('SVG loading', () => {
  it('stretches the image to the drawn rectangle instead of letterboxing it', () => {
    expect(stretchToViewport('<?xml?><svg width="2" viewBox="0 0 2 1"><g/></svg>')).toBe('<?xml?><svg width="2" viewBox="0 0 2 1" preserveAspectRatio="none"><g/></svg>');
    expect(stretchToViewport('<svg preserveAspectRatio="xMidYMid" x="1">')).toBe('<svg x="1" preserveAspectRatio="none">');
  });
});

describe('asset loader', () => {
  it('rejects a catalog that fails validation with ASSET_INVALID', async () => {
    const fetcher: Fetcher = { json: () => Promise.resolve({ formatVersion: 2 }), bytes: () => Promise.reject(new Error('unused')) };
    const error = await fetchValidated(fetcher, 'assets/manifest.json', ManifestSchema).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(ErrorCode.AssetInvalid);
  });

  it('runs tasks with a concurrency limit and keeps result order', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapLimited([1, 2, 3, 4, 5], 2, async (value) => {
      running++;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running--;
      return value * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it.skipIf(assetsMissing)('loads and validates every catalog with progress', async () => {
    const fetcher = diskFetcher();
    const progress: LoadProgress[] = [];
    const catalogs = await loadCatalogs(fetcher, BASE, (step) => progress.push(step));
    expect(catalogs.rooms.size).toBe(18);
    expect(catalogs.roomIndex.rooms[0]?.name).toBe('BOXY');
    const last = progress[progress.length - 1];
    expect(last).toEqual({ phase: LoadPhase.Catalogs, loaded: last?.total, total: 24 });
  });

  it.skipIf(assetsMissing)('lists every SVG of the library once', () => {
    const paths = graphicPaths(assetSymbols());
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.length).toBeGreaterThan(600);
  });
});
