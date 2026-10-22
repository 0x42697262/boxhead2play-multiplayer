import { Position } from '../math/Position.ts';
import { CELL_SIZE_PX } from '../map/tuning.ts';

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const ModelPoint = {
  HandRight: 'handRight',
  HandLeft: 'handLeft',
  GunPositionRight: 'gunPositionRight',
} as const;

export type ModelPoint = (typeof ModelPoint)[keyof typeof ModelPoint];

export type FrameModelPoints = Readonly<Partial<Record<ModelPoint, Vector3>>>;

export interface CharacterAnimation {
  readonly directionCount: number;
  readonly frameCount: number;
  readonly frameSequence?: readonly number[];
  readonly tiltDegrees: number;
  readonly modelPoints: readonly (readonly FrameModelPoints[])[];
}

export interface ClipAnimation {
  readonly frameCount: number;
}

export interface AnimationCatalog {
  readonly modelScale: number;
  readonly characters: Readonly<Record<string, CharacterAnimation>>;
  readonly clips: Readonly<Record<string, ClipAnimation>>;
}

export const DEFAULT_MODEL_SCALE = 0.35;

export const EMPTY_ANIMATION_CATALOG: AnimationCatalog = { modelScale: DEFAULT_MODEL_SCALE, characters: {}, clips: {} };

const DEGREES_PER_HALF_TURN = 180;

export function tiltRadians(tiltDegrees: number): number {
  return (tiltDegrees * Math.PI) / DEGREES_PER_HALF_TURN;
}

export function projectionFactor(tiltDegrees: number): number {
  return -Math.sin(tiltRadians(tiltDegrees));
}

export function sourceFrame(animation: CharacterAnimation, frame: number): number {
  return animation.frameSequence?.[frame] ?? frame;
}

export function modelPointToCells(point: Vector3, pFactor: number, modelScale: number): Position {
  return new Position(point.x * modelScale, pFactor * point.y * modelScale, -point.z * modelScale).scale(1 / CELL_SIZE_PX);
}

export function clipFrameCount(catalog: AnimationCatalog, symbol: string, fallback: number): number {
  return catalog.clips[symbol]?.frameCount ?? fallback;
}

export const DEFAULT_PROJECTION_FACTOR = 1;

export function worldProjectionFactor(catalog: AnimationCatalog): number {
  const first = Object.values(catalog.characters)[0];
  return first ? projectionFactor(first.tiltDegrees) : DEFAULT_PROJECTION_FACTOR;
}
