import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_MODEL_SCALE,
  type AnimationCatalog,
  type CharacterAnimation,
  type ClipAnimation,
  type FrameModelPoints,
  type Vector3,
} from '../../../src/domain/animation/AnimationCatalog.ts';
import { DEVIL_COLLECTION, PLAYER_COLLECTION, ZOMBIE_COLLECTION } from '../../../src/domain/things/creatures/characterCollections.ts';
import { ClipSymbol } from '../../../src/domain/things/clipVisual.ts';

export interface SyntheticCatalogOptions {
  readonly directionCount?: number;
  readonly frameCount?: number;
  readonly tiltDegrees?: number;
  readonly clipFrameCount?: number;
  readonly clipFrames?: Readonly<Record<string, number>>;
  readonly gunOffset?: Vector3;
}

const DEFAULTS = { directionCount: 8, frameCount: 4, tiltDegrees: 45, clipFrameCount: 4 } as const;

export function syntheticAnimationCatalog(options: SyntheticCatalogOptions = {}): AnimationCatalog {
  const directionCount = options.directionCount ?? DEFAULTS.directionCount;
  const frameCount = options.frameCount ?? DEFAULTS.frameCount;
  const frame: FrameModelPoints = options.gunOffset ? { gunPositionRight: options.gunOffset } : {};
  const animation: CharacterAnimation = {
    directionCount,
    frameCount,
    tiltDegrees: options.tiltDegrees ?? DEFAULTS.tiltDegrees,
    modelPoints: Array.from({ length: directionCount }, () => Array.from({ length: frameCount }, () => frame)),
  };
  const characters: Record<string, CharacterAnimation> = {};
  for (const collection of [PLAYER_COLLECTION, ZOMBIE_COLLECTION, DEVIL_COLLECTION]) {
    for (const linkage of Object.values(collection)) characters[linkage] = animation;
  }
  const clips: Record<string, ClipAnimation> = {};
  for (const symbol of Object.values(ClipSymbol)) clips[symbol] = { frameCount: options.clipFrames?.[symbol] ?? options.clipFrameCount ?? DEFAULTS.clipFrameCount };
  for (const [symbol, count] of Object.entries(options.clipFrames ?? {})) clips[symbol] = { frameCount: count };
  return { modelScale: DEFAULT_MODEL_SCALE, characters, clips };
}

const ASSETS = resolve(import.meta.dirname, '../../../public/assets');

interface AnimMetaSet {
  readonly directionCount: number;
  readonly frameCount: number;
  readonly frameSequence?: readonly number[];
  readonly tilt: number;
  readonly anchors: readonly (readonly Readonly<Record<string, Vector3>>[])[];
}

interface AnimMeta {
  readonly globalScale: number;
  readonly sets: Readonly<Record<string, AnimMetaSet>>;
}

interface SymbolPlacement {
  readonly characterId?: number;
  readonly name?: string;
}

interface SymbolSprite {
  readonly frameCount: number;
  readonly frames?: readonly (readonly SymbolPlacement[])[];
}

interface SymbolLibrary {
  readonly exports: Readonly<Record<string, number>>;
  readonly sprites: Readonly<Record<string, SymbolSprite>>;
}

const ANCHOR_NAMES: Readonly<Record<string, keyof FrameModelPoints>> = {
  Hand_Right: 'handRight',
  Hand_Left: 'handLeft',
  GunPosition_Right: 'gunPositionRight',
};

export function assetAnimationCatalog(): AnimationCatalog | undefined {
  const metaPath = resolve(ASSETS, 'characters/anim-meta.json');
  const symbolsPath = resolve(ASSETS, 'library/symbols.json');
  if (!existsSync(metaPath) || !existsSync(symbolsPath)) return undefined;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as AnimMeta;
  const library = JSON.parse(readFileSync(symbolsPath, 'utf8')) as SymbolLibrary;
  const characters: Record<string, CharacterAnimation> = {};
  for (const [id, set] of Object.entries(meta.sets)) {
    characters[id] = {
      directionCount: set.directionCount,
      frameCount: set.frameCount,
      ...(set.frameSequence ? { frameSequence: set.frameSequence } : {}),
      tiltDegrees: set.tilt,
      modelPoints: set.anchors.map((frames) =>
        frames.map((anchors) => {
          const points: Partial<Record<keyof FrameModelPoints, Vector3>> = {};
          for (const [name, point] of Object.entries(anchors)) {
            const key = ANCHOR_NAMES[name];
            if (key) points[key] = point;
          }
          return points;
        }),
      ),
    };
  }
  const clips: Record<string, ClipAnimation> = {};
  for (const [linkage, characterId] of Object.entries(library.exports)) {
    const sprite = library.sprites[String(characterId)];
    if (!sprite) continue;
    const contents = sprite.frames?.[0]?.find((placement) => placement.name === '_Contents');
    const inner = contents?.characterId === undefined ? undefined : library.sprites[String(contents.characterId)];
    clips[linkage] = { frameCount: Number(inner?.frameCount ?? sprite.frameCount) };
  }
  return { modelScale: meta.globalScale, characters, clips };
}
