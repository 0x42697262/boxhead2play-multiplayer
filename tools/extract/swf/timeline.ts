import { IDENTITY_MATRIX } from './geometry.ts';
import type { ColorTransform, Filter, PlaceTag, SpriteDefinition, StartSoundTag, TwipsMatrix } from './types.ts';

export interface DisplayObjectState {
  readonly depth: number;
  readonly characterId: number;
  readonly instance: number;
  readonly matrix: TwipsMatrix;
  readonly colorTransform?: ColorTransform;
  readonly name?: string;
  readonly ratio?: number;
  readonly clipDepth?: number;
  readonly filters?: readonly Filter[];
  readonly blendMode?: number;
  readonly visible?: boolean;
  readonly hasClipActions: boolean;
}

export interface ResolvedFrame {
  readonly displayList: readonly DisplayObjectState[];
  readonly labels: readonly string[];
  readonly sounds: readonly StartSoundTag[];
  readonly hasAction: boolean;
}

export class TimelineError extends Error {}

function overrides(tag: PlaceTag): Partial<DisplayObjectState> {
  return {
    ...(tag.matrix === undefined ? {} : { matrix: tag.matrix }),
    ...(tag.colorTransform === undefined ? {} : { colorTransform: tag.colorTransform }),
    ...(tag.name === undefined ? {} : { name: tag.name }),
    ...(tag.ratio === undefined ? {} : { ratio: tag.ratio }),
    ...(tag.clipDepth === undefined ? {} : { clipDepth: tag.clipDepth }),
    ...(tag.filters === undefined ? {} : { filters: tag.filters }),
    ...(tag.blendMode === undefined ? {} : { blendMode: tag.blendMode }),
    ...(tag.visible === undefined ? {} : { visible: tag.visible }),
  };
}

export function resolveTimeline(sprite: SpriteDefinition): ResolvedFrame[] {
  const displayList = new Map<number, DisplayObjectState>();
  const frames: ResolvedFrame[] = [];
  let nextInstance = 0;
  let labels: string[] = [];
  let sounds: StartSoundTag[] = [];
  let hasAction = false;

  const place = (tag: PlaceTag): void => {
    const existing = displayList.get(tag.depth);
    if (tag.move && existing !== undefined) {
      const replacesCharacter = tag.characterId !== undefined && tag.characterId !== existing.characterId;
      displayList.set(tag.depth, {
        ...existing,
        ...overrides(tag),
        ...(replacesCharacter ? { characterId: tag.characterId, instance: nextInstance++ } : {}),
        hasClipActions: existing.hasClipActions || tag.hasClipActions,
      });
      return;
    }
    if (tag.characterId === undefined) {
      throw new TimelineError(`Sprite ${sprite.id} modifies empty depth ${tag.depth}`);
    }
    displayList.set(tag.depth, {
      depth: tag.depth,
      characterId: tag.characterId,
      instance: nextInstance++,
      matrix: IDENTITY_MATRIX,
      ...overrides(tag),
      hasClipActions: tag.hasClipActions,
    });
  };

  const snapshot = (): ResolvedFrame => ({
    displayList: [...displayList.values()].sort((first, second) => first.depth - second.depth),
    labels,
    sounds,
    hasAction,
  });

  for (const tag of sprite.tags) {
    switch (tag.kind) {
      case 'place':
        place(tag);
        break;
      case 'remove':
        displayList.delete(tag.depth);
        break;
      case 'label':
        labels = [...labels, tag.name];
        break;
      case 'startSound':
        sounds = [...sounds, tag];
        break;
      case 'action':
        hasAction = true;
        break;
      case 'showFrame':
        frames.push(snapshot());
        labels = [];
        sounds = [];
        hasAction = false;
        break;
    }
  }
  while (frames.length < sprite.frameCount) frames.push(snapshot());
  return frames;
}
