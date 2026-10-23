import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCatalogs, type Fetcher } from '../../adapters/assets/AssetLoader.ts';
import { toAnimationCatalog, toRoomDefinition } from '../../adapters/assets/mapping.ts';
import { createThingFactory } from '../../domain/things/factory.ts';
import { AppError, ErrorCode } from '../../text/errors.ts';
import type { GameContent } from '../ports.ts';

async function readAsset(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new AppError(ErrorCode.AssetMissing, `${path}: ${String(error)}`);
  }
}

export function directoryFetcher(directory: string): Fetcher {
  return {
    async json(path) {
      return JSON.parse((await readAsset(join(directory, path))).toString('utf8')) as unknown;
    },
    async bytes(path) {
      const buffer = await readAsset(join(directory, path));
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    },
  };
}

export async function loadGameContent(assetDir: string): Promise<GameContent> {
  const catalogs = await loadCatalogs(directoryFetcher(assetDir), '');
  const rooms = new Map([...catalogs.rooms.values()].map((room) => [room.id, toRoomDefinition(room)] as const));
  return { rooms, animations: toAnimationCatalog(catalogs.animMeta, catalogs.symbols), factory: createThingFactory() };
}
