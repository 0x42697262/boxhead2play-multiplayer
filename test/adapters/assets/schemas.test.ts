import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  AnimMetaSchema,
  FontIndexSchema,
  ManifestSchema,
  RoomIndexSchema,
  RoomSchema,
  SoundIndexSchema,
  SymbolsCatalogSchema,
  XsiCatalogSchema,
} from '../../../src/adapters/assets/schemas.ts';

const ASSET_ROOT = path.resolve(import.meta.dirname, '../../../public/assets');
const MANIFEST_PATH = path.join(ASSET_ROOT, 'manifest.json');
const assetsMissing = !existsSync(MANIFEST_PATH);

function readCatalog<T>(schema: z.ZodType<T>, relativePath: string): T {
  return schema.parse(JSON.parse(readFileSync(path.join(ASSET_ROOT, relativePath), 'utf8')));
}

describe('generated asset catalogs', () => {
  it.skipIf(assetsMissing)('parse with the runtime schemas', () => {
    const manifest = readCatalog(ManifestSchema, 'manifest.json');
    readCatalog(SymbolsCatalogSchema, manifest.catalogs.symbols);
    readCatalog(XsiCatalogSchema, manifest.catalogs.xsi);
    readCatalog(AnimMetaSchema, manifest.catalogs.animMeta);
    readCatalog(SoundIndexSchema, manifest.catalogs.sounds);
    readCatalog(FontIndexSchema, manifest.catalogs.fonts);
    const roomIndex = readCatalog(RoomIndexSchema, manifest.catalogs.roomIndex);
    expect(roomIndex.rooms).toHaveLength(manifest.catalogs.rooms.length);
    for (const roomPath of manifest.catalogs.rooms) readCatalog(RoomSchema, roomPath);
  });

  it.skipIf(assetsMissing)('list only files that exist', () => {
    const manifest = readCatalog(ManifestSchema, 'manifest.json');
    const missing = manifest.files.filter((file) => !existsSync(path.join(ASSET_ROOT, file.path)));
    expect(missing).toEqual([]);
  });
});

describe('schemas', () => {
  it('reject catalogs with an unknown format version', () => {
    expect(RoomIndexSchema.safeParse({ formatVersion: 2, rooms: [] }).success).toBe(false);
    expect(RoomIndexSchema.safeParse({ formatVersion: 1, rooms: [] }).success).toBe(true);
  });
});
