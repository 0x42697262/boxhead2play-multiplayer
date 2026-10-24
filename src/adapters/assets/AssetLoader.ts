import type { z } from 'zod';
import { AppError, ErrorCode } from '../../text/errors.ts';
import {
  AnimMetaSchema,
  FontIndexSchema,
  ManifestSchema,
  RoomIndexSchema,
  RoomSchema,
  SoundIndexSchema,
  SymbolsCatalogSchema,
  XsiCatalogSchema,
  type AnimMeta,
  type FontIndex,
  type Manifest,
  type Room,
  type RoomIndex,
  type SoundIndex,
  type SymbolsCatalog,
  type XsiCatalog,
} from './schemas.ts';
import { fetchAssetBody } from './http.ts';
import { LoadPhase, PARALLEL_DOWNLOADS, type ProgressListener } from './tuning.ts';
import { AssetLocator, joinUrl } from './urls.ts';

export const MANIFEST_FILE = 'manifest.json';

const REVALIDATE: RequestInit = { cache: 'no-cache' };

const SINGLE_CATALOGS = ['symbols', 'roomIndex', 'xsi', 'animMeta', 'sounds', 'fonts'] as const;

export interface FetchOptions {
  readonly revalidate?: boolean;
}

export interface Fetcher {
  json(url: string, options?: FetchOptions): Promise<unknown>;
  bytes(url: string): Promise<ArrayBuffer>;
}

export interface GameCatalogs {
  readonly baseUrl: string;
  readonly locator: AssetLocator;
  readonly manifest: Manifest;
  readonly symbols: SymbolsCatalog;
  readonly roomIndex: RoomIndex;
  readonly rooms: ReadonlyMap<string, Room>;
  readonly xsi: XsiCatalog;
  readonly animMeta: AnimMeta;
  readonly sounds: SoundIndex;
  readonly fonts: FontIndex;
}

export const browserFetcher: Fetcher = {
  json(url, options = {}) {
    return fetchAssetBody(url, (response): Promise<unknown> => response.json(), fetch, options.revalidate === true ? REVALIDATE : {});
  },
  bytes(url) {
    return fetchAssetBody(url, (response) => response.arrayBuffer());
  },
};

export async function fetchValidated<T>(fetcher: Fetcher, url: string, schema: z.ZodType<T>, options: FetchOptions = {}): Promise<T> {
  const raw = await fetcher.json(url, options);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AppError(ErrorCode.AssetInvalid, `${url}: ${parsed.error.message}`);
  return parsed.data;
}

export async function mapLimited<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await task(items[index] as T, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function loadCatalogs(fetcher: Fetcher, baseUrl: string, onProgress: ProgressListener = () => undefined): Promise<GameCatalogs> {
  const manifest = await fetchValidated(fetcher, joinUrl(baseUrl, MANIFEST_FILE), ManifestSchema, { revalidate: true });
  const locator = new AssetLocator(baseUrl, manifest.files);
  const { catalogs } = manifest;
  const total = SINGLE_CATALOGS.length + catalogs.rooms.length;
  let loaded = 0;
  const tick = <T>(value: T): T => {
    loaded++;
    onProgress({ phase: LoadPhase.Catalogs, loaded, total });
    return value;
  };
  const url = (path: string): string => locator.url(path);
  const [symbols, roomIndex, xsi, animMeta, sounds, fonts] = await Promise.all([
    fetchValidated(fetcher, url(catalogs.symbols), SymbolsCatalogSchema).then(tick),
    fetchValidated(fetcher, url(catalogs.roomIndex), RoomIndexSchema).then(tick),
    fetchValidated(fetcher, url(catalogs.xsi), XsiCatalogSchema).then(tick),
    fetchValidated(fetcher, url(catalogs.animMeta), AnimMetaSchema).then(tick),
    fetchValidated(fetcher, url(catalogs.sounds), SoundIndexSchema).then(tick),
    fetchValidated(fetcher, url(catalogs.fonts), FontIndexSchema).then(tick),
  ]);
  const roomList = await mapLimited(catalogs.rooms, PARALLEL_DOWNLOADS, (path) => fetchValidated(fetcher, url(path), RoomSchema).then(tick));
  const rooms = new Map(roomList.map((room) => [room.id, room]));
  for (const entry of roomIndex.rooms) {
    if (!rooms.has(entry.id)) throw new AppError(ErrorCode.AssetMissing, locator.entryUrl(catalogs.roomIndex, entry.file));
  }
  return { baseUrl, locator, manifest, symbols, roomIndex, rooms, xsi, animMeta, sounds, fonts };
}
