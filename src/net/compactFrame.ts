import { sourceFrame, type AnimationCatalog } from '../domain/animation/AnimationCatalog.ts';
import { DecalKind, DomainEventType, type DecalRequested, type Point3, type ScoreAwarded, type SoundRequested } from '../domain/events.ts';
import { DecalSymbol } from '../domain/map/MapDecals.ts';
import { DECAL_DIRECTIONS, DECAL_SCALE_X, DECAL_SCALE_Y } from '../domain/map/tuning.ts';
import { CHARACTER_STYLE_SCALES, VisualKind, type DrawEntry, type Visual } from '../domain/visuals.ts';
import type { NetCharacterVisual, NetDecal, NetDrawEntry, NetEvent, NetFrame, NetVisual } from './protocol.ts';

const UNKNOWN_ANIMATION_DIRECTIONS = 1;

const DECAL_SYMBOLS: Readonly<Record<DecalKind, string>> = {
  [DecalKind.BloodSplat]: DecalSymbol.BloodSplat,
  [DecalKind.ScorchMark]: DecalSymbol.ScorchMark,
};

export type PlayEvent = SoundRequested | DecalRequested | ScoreAwarded;

export interface PlayFrame extends Omit<NetFrame, 'entries' | 'events'> {
  readonly entries: readonly DrawEntry[];
  readonly events: readonly PlayEvent[];
}

function samePoint(first: Point3, second: Point3): boolean {
  return first.x === second.x && first.y === second.y && first.z === second.z;
}

function compactVisual(visual: Visual, position: Point3): NetVisual {
  switch (visual.kind) {
    case VisualKind.Character: {
      const { kind, layer, style, animation, direction, frame, alpha } = visual;
      const compact: NetCharacterVisual = { kind, layer, style, animation, direction, frame, alpha };
      return samePoint(visual.position, position) ? compact : { ...compact, position: visual.position };
    }
    case VisualKind.Clip: {
      const { position: own, ...rest } = visual;
      return samePoint(own, position) ? rest : { ...rest, position: own };
    }
    default:
      return visual;
  }
}

export function compactEntry(entry: DrawEntry): NetDrawEntry {
  return { ...entry, visual: compactVisual(entry.visual, entry.position) };
}

export function compactDecal(decal: DecalRequested): NetDecal {
  const { symbol, rotationCount, scaleX, scaleY, ...rest } = decal;
  return {
    ...rest,
    ...(symbol === DECAL_SYMBOLS[decal.decal] ? {} : { symbol }),
    ...(rotationCount === DECAL_DIRECTIONS ? {} : { rotationCount }),
    ...(scaleX === DECAL_SCALE_X ? {} : { scaleX }),
    ...(scaleY === DECAL_SCALE_Y ? {} : { scaleY }),
  };
}

function expandVisual(visual: NetVisual, position: Point3, animations: AnimationCatalog): Visual {
  switch (visual.kind) {
    case VisualKind.Character: {
      const animation = animations.characters[visual.animation];
      return {
        ...visual,
        position: visual.position ?? position,
        styleScale: CHARACTER_STYLE_SCALES[visual.style],
        directionCount: animation?.directionCount ?? UNKNOWN_ANIMATION_DIRECTIONS,
        sourceFrame: animation ? sourceFrame(animation, visual.frame) : visual.frame,
      };
    }
    case VisualKind.Clip:
      return { ...visual, position: visual.position ?? position };
    default:
      return visual;
  }
}

export function expandEntry(entry: NetDrawEntry, animations: AnimationCatalog): DrawEntry {
  return { ...entry, visual: expandVisual(entry.visual, entry.position, animations) };
}

export function expandDecal(decal: NetDecal): DecalRequested {
  return {
    ...decal,
    symbol: decal.symbol ?? DECAL_SYMBOLS[decal.decal],
    rotationCount: decal.rotationCount ?? DECAL_DIRECTIONS,
    scaleX: decal.scaleX ?? DECAL_SCALE_X,
    scaleY: decal.scaleY ?? DECAL_SCALE_Y,
  };
}

function expandEvent(event: NetEvent): PlayEvent {
  return event.type === DomainEventType.DecalRequested ? expandDecal(event) : event;
}

export function expandFrame(frame: NetFrame, animations: AnimationCatalog): PlayFrame {
  return {
    ...frame,
    entries: frame.entries.map((entry) => expandEntry(entry, animations)),
    events: frame.events.map(expandEvent),
  };
}
