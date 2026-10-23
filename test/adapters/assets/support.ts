import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import {
  AnimMetaSchema,
  ManifestSchema,
  RoomSchema,
  SymbolsCatalogSchema,
  XsiCatalogSchema,
  type AnimMeta,
  type Room,
  type SymbolsCatalog,
  type XsiCatalog,
} from '../../../src/adapters/assets/schemas.ts';

export const ASSET_ROOT = path.resolve(import.meta.dirname, '../../../public/assets');
export const assetsMissing = !existsSync(path.join(ASSET_ROOT, 'manifest.json'));

export function readAsset<T>(schema: z.ZodType<T>, relativePath: string): T {
  return schema.parse(JSON.parse(readFileSync(path.join(ASSET_ROOT, relativePath), 'utf8')));
}

let symbolsCache: SymbolsCatalog | undefined;
let xsiCache: XsiCatalog | undefined;

export function assetSymbols(): SymbolsCatalog {
  symbolsCache ??= readAsset(SymbolsCatalogSchema, readAsset(ManifestSchema, 'manifest.json').catalogs.symbols);
  return symbolsCache;
}

export function assetXsi(): XsiCatalog {
  xsiCache ??= readAsset(XsiCatalogSchema, readAsset(ManifestSchema, 'manifest.json').catalogs.xsi);
  return xsiCache;
}

export function assetAnimMeta(): AnimMeta {
  return readAsset(AnimMetaSchema, readAsset(ManifestSchema, 'manifest.json').catalogs.animMeta);
}

export function assetRoomFile(id: string): Room {
  return readAsset(RoomSchema, `rooms/${id}.json`);
}
