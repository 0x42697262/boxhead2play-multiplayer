import type { Matrix } from '../geometry/Matrix.ts';
import type { Rect } from '../geometry/Rect.ts';
import { SURFACE_MIN_SIZE } from '../tuning.ts';

export interface BufferLayout {
  readonly width: number;
  readonly height: number;
  readonly dispX: number;
  readonly dispY: number;
  readonly matrix: Matrix;
}

export function bufferLayout(bounds: Rect | null, clipScaleX: number, clipScaleY: number, clipInflatePx: number, resolution = 1): BufferLayout {
  const scaleX = clipScaleX * resolution;
  const scaleY = clipScaleY * resolution;
  if (!bounds) return { width: SURFACE_MIN_SIZE, height: SURFACE_MIN_SIZE, dispX: 0, dispY: 0, matrix: [scaleX, 0, 0, scaleY, 0, 0] };
  let x = Math.floor(bounds.xMin);
  let y = Math.floor(bounds.yMin);
  let w = Math.ceil(bounds.xMax) - x;
  let h = Math.ceil(bounds.yMax) - y;
  w = (w * clipScaleX + clipInflatePx * 2) * resolution;
  h = (h * clipScaleY + clipInflatePx * 2) * resolution;
  x -= clipInflatePx;
  y -= clipInflatePx;
  const dispX = Math.floor(x * scaleX);
  const dispY = Math.floor(y * scaleY);
  return {
    width: Math.max(SURFACE_MIN_SIZE, Math.ceil(w)),
    height: Math.max(SURFACE_MIN_SIZE, Math.ceil(h)),
    dispX,
    dispY,
    matrix: [scaleX, 0, 0, scaleY, -dispX, -dispY],
  };
}
