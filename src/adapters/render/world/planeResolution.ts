import { RoomDetail } from '../../../services/roomDetail.ts';
import { RGBA_STRIDE } from '../tuning.ts';
import {
  BYTES_PER_GIB,
  DESKTOP_PLANE_BUDGET_PX,
  DESKTOP_PLANE_MEMORY_SHARE,
  LOW_PLANE_RESOLUTION,
  MAX_PLANE_BUDGET_PX,
  MIN_AUTO_PLANE_RESOLUTION,
  MIN_PLANE_BUDGET_PX,
  PLANE_RESOLUTION_STEP,
  ROOM_PLANE_COUNT,
  TOUCH_PLANE_BUDGET_PX,
  TOUCH_PLANE_MEMORY_SHARE,
} from './tuning.ts';

export interface PlaneSize {
  readonly width: number;
  readonly height: number;
}

export interface DeviceHint {
  readonly memoryGiB: number | undefined;
  readonly touch: boolean;
}

export interface PlaneLimits {
  readonly budgetArea: number;
  readonly usableArea: (wanted: number) => number;
}

export type RoomPlaneResolution = (size: PlaneSize, screenResolution: number, detail: RoomDetail) => number;

export function planeBudgetArea(hint: DeviceHint): number {
  if (hint.memoryGiB === undefined) return hint.touch ? TOUCH_PLANE_BUDGET_PX : DESKTOP_PLANE_BUDGET_PX;
  const share = hint.touch ? TOUCH_PLANE_MEMORY_SHARE : DESKTOP_PLANE_MEMORY_SHARE;
  const area = (hint.memoryGiB * BYTES_PER_GIB * share) / (ROOM_PLANE_COUNT * RGBA_STRIDE);
  return Math.min(MAX_PLANE_BUDGET_PX, Math.max(MIN_PLANE_BUDGET_PX, Math.floor(area)));
}

export function planeArea(size: PlaneSize, resolution: number): number {
  return Math.ceil(size.width * resolution) * Math.ceil(size.height * resolution);
}

function stepDown(resolution: number): number {
  return Math.floor(resolution / PLANE_RESOLUTION_STEP) * PLANE_RESOLUTION_STEP;
}

export function resolutionWithin(size: PlaneSize, area: number): number {
  let resolution = stepDown(Math.sqrt(area / (size.width * size.height)));
  while (resolution > PLANE_RESOLUTION_STEP && planeArea(size, resolution) > area) resolution -= PLANE_RESOLUTION_STEP;
  return Math.max(resolution, PLANE_RESOLUTION_STEP);
}

function wantedResolution(detail: RoomDetail, screenResolution: number, size: PlaneSize, budgetArea: number): number {
  switch (detail) {
    case RoomDetail.Low:
      return Math.min(screenResolution, LOW_PLANE_RESOLUTION);
    case RoomDetail.High:
      return screenResolution;
    case RoomDetail.Auto:
      return Math.min(screenResolution, Math.max(MIN_AUTO_PLANE_RESOLUTION, resolutionWithin(size, budgetArea)));
  }
}

export function planeResolution(detail: RoomDetail, screenResolution: number, size: PlaneSize, limits: PlaneLimits): number {
  const wanted = wantedResolution(detail, screenResolution, size, limits.budgetArea);
  const area = planeArea(size, wanted);
  const usable = limits.usableArea(area);
  return usable >= area ? wanted : Math.min(wanted, resolutionWithin(size, usable));
}
