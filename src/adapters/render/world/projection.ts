import type { Point2, Point3 } from '../../../domain/events.ts';
import { stepToDirectionLookup } from '../../../domain/math/Angle.ts';
import { CELL_SIZE_PX } from '../../../domain/map/tuning.ts';
import { cellToScreen } from '../../../domain/world/camera.ts';
import { ANGLE_STEP_MASK, ANGLE_STEPS, FULL_TURN_RADIANS } from '../tuning.ts';

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
