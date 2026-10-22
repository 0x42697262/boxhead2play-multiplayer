import { clipFrameCount, type AnimationCatalog } from '../animation/AnimationCatalog.ts';
import { ClipAnimator, type ClipEnd } from '../animation/ClipAnimator.ts';
import type { Position } from '../math/Position.ts';
import { MISSING_CLIP_FRAME_COUNT } from '../map/tuning.ts';
import { ClipMode, OPAQUE_ALPHA, VisualKind, VisualLayer, type ClipVisual, type LineVisual } from '../visuals.ts';

export const ClipSymbol = {
  Barrel: 'Object.Barrel',
  Wall: 'Object.Wall',
  Pickup: 'Object.Pickup',
  Mine: 'Object.Mine',
  ChargePack: 'Object.ChargePack',
  Rocket: 'Shot.Rocket',
  Grenade: 'Shot.Grenade',
  ClusterShell: 'Shot.ClusterShell',
  Devastator: 'Shot.Devastator',
  FireBall: 'Effect.FireBall',
  Explosion: 'Effect.Explosion',
  BulletHit: 'Effect.BulletHit',
  RocketSmoke: 'Effect.RocketSmoke',
  SmokeCloud: 'Effect.SmokeCloud',
  PistolMuzzleFlash: 'Pistol.MuzzleFlash',
  UziMuzzleFlash: 'UZI.MuzzleFlash',
  ShotgunMuzzleFlash: 'Shotgun.MuzzleFlash',
  RailgunMuzzleFlash: 'Railgun.MuzzleFlash',
} as const;

export type ClipSymbol = (typeof ClipSymbol)[keyof typeof ClipSymbol];

export const STATIC_FRAME = 0;
export const UNIT_SCALE = 1;

export function clipAnimator(catalog: AnimationCatalog, symbol: ClipSymbol, end?: ClipEnd): ClipAnimator {
  return new ClipAnimator(clipFrameCount(catalog, symbol, MISSING_CLIP_FRAME_COUNT), end);
}

export interface ClipVisualOptions {
  readonly alpha?: number;
  readonly angleRadians?: number;
  readonly rotationCount?: number;
}

export function clipVisual(symbol: ClipSymbol, mode: ClipMode, frame: number, position: Position, options: ClipVisualOptions = {}): ClipVisual {
  const base: ClipVisual = {
    kind: VisualKind.Clip,
    layer: VisualLayer.World,
    mode,
    symbol,
    frame,
    scale: UNIT_SCALE,
    alpha: options.alpha ?? OPAQUE_ALPHA,
    position: { x: position.x, y: position.y, z: position.z },
  };
  if (options.angleRadians === undefined) return base;
  return {
    ...base,
    angleRadians: options.angleRadians,
    ...(options.rotationCount === undefined ? {} : { rotationCount: options.rotationCount }),
  };
}

export function staticClip(symbol: ClipSymbol, position: Position, alpha?: number): ClipVisual {
  return clipVisual(symbol, ClipMode.Static, STATIC_FRAME, position, alpha === undefined ? {} : { alpha });
}

export function animationClip(symbol: ClipSymbol, animator: ClipAnimator, position: Position, alpha?: number): ClipVisual {
  return clipVisual(symbol, ClipMode.Animation, animator.frame, position, alpha === undefined ? {} : { alpha });
}

export interface LineStyle {
  readonly thickness: number;
  readonly color: number;
  readonly alpha: number;
}

export function lineVisual(from: Position, to: Position, style: LineStyle): LineVisual {
  return {
    kind: VisualKind.Line,
    layer: VisualLayer.Overlay,
    from: { x: from.x, y: from.y, z: from.z },
    to: { x: to.x, y: to.y, z: to.z },
    thickness: style.thickness,
    color: style.color,
    alpha: style.alpha,
  };
}
