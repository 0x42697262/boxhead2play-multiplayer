import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { InitKind, RoomDefinition, RoomInitObject } from '../../../src/domain/world/RoomDefinition.ts';

interface RoomFile {
  readonly id: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly initObjects: readonly {
    readonly order: number;
    readonly kind: InitKind;
    readonly position: { readonly x: number; readonly y: number };
    readonly position2: { readonly x: number; readonly y: number };
    readonly rotationDegrees: number;
  }[];
}

export function assetRoom(id: string): RoomDefinition | undefined {
  const path = resolve(import.meta.dirname, `../../../public/assets/rooms/${id}.json`);
  if (!existsSync(path)) return undefined;
  const file = JSON.parse(readFileSync(path, 'utf8')) as RoomFile;
  const initObjects: RoomInitObject[] = file.initObjects.map((init) => ({
    order: init.order,
    kind: init.kind,
    positionPx: init.position,
    position2Px: init.position2,
    rotationDegrees: init.rotationDegrees,
  }));
  return { id: file.id, widthPx: file.size.width, heightPx: file.size.height, initObjects };
}
