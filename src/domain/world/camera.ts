import type { Point2, Point3 } from '../events.ts';
import { CELL_SIZE_PX } from '../map/tuning.ts';
import { CAMERA_CATCH_UP_DIVISOR, CAMERA_FOLLOW_SPEED_CELLS } from './tuning.ts';

export interface CameraRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CameraInput {
  readonly target: Point3 | undefined;
  readonly last: Point3 | undefined;
  readonly smooth: boolean;
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly areaWidthPx: number;
  readonly areaHeightPx: number;
  readonly projectionFactor: number;
}

export interface CameraResult {
  readonly rect: CameraRect;
  readonly tracked: Point3 | undefined;
}

export function flashRange(value: number, min: number, max: number): number {
  if (value > max) return max;
  return value >= min ? value : min;
}

export function rectSees(rect: CameraRect, point: Point2, marginPx: number): boolean {
  return (
    point.x >= rect.x - marginPx &&
    point.x <= rect.x + rect.width + marginPx &&
    point.y >= rect.y - marginPx &&
    point.y <= rect.y + rect.height + marginPx
  );
}

export function cellToScreen(point: Point3, projectionFactor: number): Point2 {
  return {
    x: Math.round(point.x * CELL_SIZE_PX),
    y: Math.round((point.y + point.z * projectionFactor) * CELL_SIZE_PX),
  };
}

export function followTarget(target: Point3 | undefined, last: Point3 | undefined): Point3 | undefined {
  if (!target) return last;
  if (!last) return target;
  const dx = target.x - last.x;
  const dy = target.y - last.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance <= CAMERA_FOLLOW_SPEED_CELLS) return target;
  const step = CAMERA_FOLLOW_SPEED_CELLS * ((distance - CAMERA_FOLLOW_SPEED_CELLS) / CAMERA_CATCH_UP_DIVISOR + 1);
  const dz = target.z - last.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const scale = step / length;
  return { x: last.x + dx * scale, y: last.y + dy * scale, z: last.z + dz * scale };
}

export function trackCamera(input: CameraInput): CameraResult {
  const tracked = input.smooth ? followTarget(input.target, input.last) : input.target;
  const screen = tracked ? cellToScreen(tracked, input.projectionFactor) : { x: 0, y: 0 };
  const centre = Number.isNaN(screen.x) ? { x: 0, y: 0 } : screen;
  const rect = {
    x: flashRange(
      Math.round(centre.x - input.viewWidth / 2),
      CELL_SIZE_PX,
      input.areaWidthPx - (input.viewWidth + CELL_SIZE_PX),
    ),
    y: flashRange(
      Math.round(centre.y - input.viewHeight / 2),
      CELL_SIZE_PX,
      input.areaHeightPx - (input.viewHeight + CELL_SIZE_PX),
    ),
    width: input.viewWidth,
    height: input.viewHeight,
  };
  return { rect, tracked };
}
