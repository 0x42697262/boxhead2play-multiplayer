import {
  ASSET_FORMAT_VERSION,
  InitKindSchema,
  type InitKind,
  type Point,
  type Room,
  type RoomInitObject,
  type RoomPiece,
} from '../../../src/adapters/assets/schemas.ts';
import { toDisplayItem } from '../library/displayItems.ts';
import {
  concatMatrices,
  IDENTITY_MATRIX,
  rectHeight,
  rectWidth,
  rotationDegrees,
  roundToTwips,
  transformPoint,
  twipsToPixels,
} from '../swf/geometry.ts';
import type { SwfIndex } from '../swf/swfIndex.ts';
import type { DisplayObjectState } from '../swf/timeline.ts';
import type { TwipsMatrix } from '../swf/types.ts';
import { COVER_INSTANCE_NAME, INIT_CLASS_PREFIX, PIECE_INIT_KIND, ROOM_SIZE_INSTANCE_NAME } from '../tuning.ts';

export class RoomError extends Error {}

export interface RoomContext {
  readonly index: SwfIndex;
  readonly classes: ReadonlyMap<string, string>;
  readonly selfHiddenSpriteIds: ReadonlySet<number>;
}

const ORIGIN: Point = { x: 0, y: 0 };

export function initKindOf(className: string | undefined): InitKind | undefined {
  if (className?.startsWith(INIT_CLASS_PREFIX) !== true) return undefined;
  const parsed = InitKindSchema.safeParse(className.slice(INIT_CLASS_PREFIX.length));
  if (!parsed.success) throw new RoomError(`Unknown init class ${className}`);
  return parsed.data;
}

function firstFrame(index: SwfIndex, characterId: number): readonly DisplayObjectState[] {
  return index.character(characterId)?.kind === 'sprite' ? (index.timeline(characterId)[0]?.displayList ?? []) : [];
}

export function constructionOrder(displayList: readonly DisplayObjectState[]): DisplayObjectState[] {
  return [...displayList].sort((first, second) => first.instance - second.instance);
}

function roundedOrigin(matrix: TwipsMatrix): Point {
  const origin = transformPoint(matrix, ORIGIN);
  return { x: roundToTwips(origin.x), y: roundToTwips(origin.y) };
}

function pixelPoint(twips: Point): Point {
  return { x: twipsToPixels(twips.x), y: twipsToPixels(twips.y) };
}

export function composeRoom(context: RoomContext, linkage: string): Room {
  const { index } = context;
  const roomId = index.document.exports.get(linkage);
  if (roomId === undefined) throw new RoomError(`Room ${linkage} is not exported`);
  const kindOf = (characterId: number): InitKind | undefined => {
    const characterLinkage = index.linkageOf(characterId);
    return initKindOf(characterLinkage === undefined ? undefined : context.classes.get(characterLinkage));
  };
  const initObjects: RoomInitObject[] = [];
  const pieces: RoomPiece[] = [];
  const hidden = new Set<number>();

  const visit = (displayList: readonly DisplayObjectState[], parent: TwipsMatrix, path: readonly number[]): void => {
    for (const item of constructionOrder(displayList)) {
      const global = concatMatrices(parent, item.matrix);
      const instancePath = [...path, item.depth];
      const kind = kindOf(item.characterId);
      if (context.selfHiddenSpriteIds.has(item.characterId)) hidden.add(item.characterId);
      if (kind !== undefined) {
        hidden.add(item.characterId);
        const origin = roundedOrigin(global);
        const position = pixelPoint(origin);
        const placed = index.placedBounds(item);
        const order = initObjects.length;
        const characterLinkage = index.linkageOf(item.characterId) ?? '';
        initObjects.push({
          order,
          kind,
          linkage: characterLinkage,
          characterId: item.characterId,
          instancePath,
          ...(item.name === undefined ? {} : { name: item.name }),
          position,
          position2: pixelPoint({ x: origin.x + rectWidth(placed), y: origin.y + rectHeight(placed) }),
          rotationDegrees: rotationDegrees(item.matrix),
        });
        if (kind === PIECE_INIT_KIND) {
          const cover = firstFrame(index, item.characterId).find((childItem) => childItem.name === COVER_INSTANCE_NAME);
          pieces.push({
            order,
            linkage: characterLinkage,
            characterId: item.characterId,
            position,
            coverCharacterId: cover?.characterId ?? null,
            coverPosition: cover === undefined ? null : pixelPoint(roundedOrigin(concatMatrices(global, cover.matrix))),
          });
        }
      }
      visit(firstFrame(index, item.characterId), global, instancePath);
    }
  };

  const topLevel = firstFrame(index, roomId);
  visit(topLevel, IDENTITY_MATRIX, []);
  const sizeItem = topLevel.find((item) => item.name === ROOM_SIZE_INSTANCE_NAME);
  if (sizeItem === undefined) throw new RoomError(`Room ${linkage} has no ${ROOM_SIZE_INSTANCE_NAME} clip`);
  const sizeBounds = index.placedBounds(sizeItem);
  return {
    formatVersion: ASSET_FORMAT_VERSION,
    id: linkage,
    characterId: roomId,
    size: { width: twipsToPixels(rectWidth(sizeBounds)), height: twipsToPixels(rectHeight(sizeBounds)) },
    background: topLevel
      .filter((item) => kindOf(item.characterId) === undefined && !context.selfHiddenSpriteIds.has(item.characterId))
      .map(toDisplayItem),
    pieces,
    initObjects,
    hiddenCharacterIds: [...hidden].sort((first, second) => first - second),
  };
}
