import type { Point2, Point3 } from '../../../domain/events.ts';
import { stepToDirectionLookup } from '../../../domain/math/Angle.ts';
import { CELL_SIZE_PX } from '../../../domain/map/tuning.ts';
import { cellToScreen } from '../../../domain/world/camera.ts';
import { SCREEN_HEIGHT_PX, SCREEN_WIDTH_PX, SPLIT_SCREEN_SIZE_PX } from '../../../domain/world/tuning.ts';
import type { Matrix } from '../geometry/Matrix.ts';
import { ANGLE_STEP_MASK, ANGLE_STEPS, FULL_TURN_RADIANS } from '../tuning.ts';

export const SPLIT_SCREEN_SIDES = 2;
export const LEFT_SIDE_NUDGE_PX = 1;

export function thingScreenPoint(position: Point3, drawOrigin: Point2, projectionFactor: number): Point2 {
  return {
    x: position.x * CELL_SIZE_PX - drawOrigin.x,
    y: (position.y + position.z * projectionFactor) * CELL_SIZE_PX - drawOrigin.y,
  };
}

export function roundedScreenPoint(position: Point3, drawOrigin: Point2, projectionFactor: number): Point2 {
  const screen = cellToScreen(position, projectionFactor);
  return { x: screen.x - drawOrigin.x, y: screen.y - drawOrigin.y };
}

export function pixelSnap(value: number): number {
  return Math.floor(value);
}

export function floorSourceOrigin(drawOrigin: Point2): Point2 {
  return { x: -Math.round(-drawOrigin.x), y: -Math.round(-drawOrigin.y) };
}

export function omniIndex(angleRadians: number, directions: number): number {
  const step = ((angleRadians * ANGLE_STEPS) / FULL_TURN_RADIANS) & ANGLE_STEP_MASK;
  return stepToDirectionLookup(directions)[step] ?? 0;
}

export interface SplitScreenLayout {
  readonly scalar: number;
  readonly offsets: readonly Point2[];
}

export function splitScreenLayout(): SplitScreenLayout {
  const scalar = SCREEN_WIDTH_PX / SPLIT_SCREEN_SIDES / SPLIT_SCREEN_SIZE_PX;
  const offsetY = (SCREEN_HEIGHT_PX - SPLIT_SCREEN_SIZE_PX * scalar) / 2;
  return { scalar, offsets: [{ x: 0, y: offsetY }, { x: SPLIT_SCREEN_SIZE_PX * scalar, y: offsetY }] };
}

export function viewSideFor(cameraIndex: number, viewSide: number): number {
  return cameraIndex === 0 ? viewSide : (viewSide + 1) % SPLIT_SCREEN_SIDES;
}

export function splitScreenMatrix(layout: SplitScreenLayout, side: number): Matrix {
  const offset = layout.offsets[side] ?? { x: 0, y: 0 };
  return [layout.scalar, 0, 0, layout.scalar, offset.x - (side !== 0 ? 0 : LEFT_SIDE_NUDGE_PX), offset.y];
}
