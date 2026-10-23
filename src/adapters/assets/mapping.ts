import {
  ModelPoint,
  type AnimationCatalog,
  type CharacterAnimation,
  type ClipAnimation,
  type FrameModelPoints,
  type Vector3,
} from '../../domain/animation/AnimationCatalog.ts';
import type { RoomDefinition, RoomInitObject } from '../../domain/world/RoomDefinition.ts';
import type { AnimAnchors, AnimMeta, Room, SymbolsCatalog } from './schemas.ts';

export const CONTENTS_CHILD = '_Contents';

const ANCHOR_TO_MODEL_POINT: Readonly<Record<keyof AnimAnchors, ModelPoint>> = {
  Hand_Right: ModelPoint.HandRight,
  Hand_Left: ModelPoint.HandLeft,
  GunPosition_Right: ModelPoint.GunPositionRight,
};

export function toRoomDefinition(room: Room): RoomDefinition {
  const initObjects: RoomInitObject[] = room.initObjects.map((init) => ({
    order: init.order,
    kind: init.kind,
    positionPx: { x: init.position.x, y: init.position.y },
    position2Px: { x: init.position2.x, y: init.position2.y },
    rotationDegrees: init.rotationDegrees,
  }));
  return { id: room.id, widthPx: room.size.width, heightPx: room.size.height, initObjects };
}

export function toModelPoints(anchors: AnimAnchors): FrameModelPoints {
  const points: Partial<Record<ModelPoint, Vector3>> = {};
  for (const [name, point] of Object.entries(anchors) as [keyof AnimAnchors, Vector3 | undefined][]) {
    if (point) points[ANCHOR_TO_MODEL_POINT[name]] = { x: point.x, y: point.y, z: point.z };
  }
  return points;
}

export function toCharacterAnimation(set: AnimMeta['sets'][string]): CharacterAnimation {
  return {
    directionCount: set.directionCount,
    frameCount: set.frameCount,
    ...(set.frameSequence ? { frameSequence: set.frameSequence } : {}),
    tiltDegrees: set.tilt,
    modelPoints: set.anchors.map((frames) => frames.map(toModelPoints)),
  };
}

export function contentsCharacterId(symbols: SymbolsCatalog, spriteId: number): number | undefined {
  const sprite = symbols.sprites[String(spriteId)];
  return sprite?.frames[0]?.find((item) => item.name === CONTENTS_CHILD)?.characterId;
}

export function clipFrameCountOf(symbols: SymbolsCatalog, spriteId: number): number | undefined {
  const sprite = symbols.sprites[String(spriteId)];
  if (!sprite) return undefined;
  const contentsId = contentsCharacterId(symbols, spriteId);
  const contents = contentsId === undefined ? undefined : symbols.sprites[String(contentsId)];
  return contents?.frameCount ?? sprite.frameCount;
}

export function toClipAnimations(symbols: SymbolsCatalog): Record<string, ClipAnimation> {
  const clips: Record<string, ClipAnimation> = {};
  for (const [linkage, characterId] of Object.entries(symbols.exports)) {
    const frameCount = clipFrameCountOf(symbols, characterId);
    if (frameCount !== undefined) clips[linkage] = { frameCount };
  }
  return clips;
}

export function toAnimationCatalog(animMeta: AnimMeta, symbols: SymbolsCatalog): AnimationCatalog {
  const characters: Record<string, CharacterAnimation> = {};
  for (const [setId, set] of Object.entries(animMeta.sets)) characters[setId] = toCharacterAnimation(set);
  return { modelScale: animMeta.globalScale, characters, clips: toClipAnimations(symbols) };
}
