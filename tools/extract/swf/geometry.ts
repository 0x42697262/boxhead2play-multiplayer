import { FIXED_16_16_ONE, RADIANS_TO_DEGREES, TWIPS_PER_PIXEL } from '../tuning.ts';
import type { TwipsMatrix, TwipsRect } from './types.ts';

export const IDENTITY_MATRIX: TwipsMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export type PixelMatrix = readonly [a: number, b: number, c: number, d: number, tx: number, ty: number];

export interface PixelRect {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function snapFixed16(value: number): number {
  return Math.round(value * FIXED_16_16_ONE) / FIXED_16_16_ONE;
}

export function twipsToPixels(twips: number): number {
  return twips / TWIPS_PER_PIXEL;
}

export function roundToTwips(twips: number): number {
  return Math.round(twips);
}

export function concatMatrices(parent: TwipsMatrix, local: TwipsMatrix): TwipsMatrix {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    tx: parent.a * local.tx + parent.c * local.ty + parent.tx,
    ty: parent.b * local.tx + parent.d * local.ty + parent.ty,
  };
}

export function transformPoint(matrix: TwipsMatrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
    y: matrix.b * point.x + matrix.d * point.y + matrix.ty,
  };
}

export function transformRect(matrix: TwipsMatrix, rect: TwipsRect): TwipsRect {
  const corners = [
    transformPoint(matrix, { x: rect.xMin, y: rect.yMin }),
    transformPoint(matrix, { x: rect.xMax, y: rect.yMin }),
    transformPoint(matrix, { x: rect.xMin, y: rect.yMax }),
    transformPoint(matrix, { x: rect.xMax, y: rect.yMax }),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    xMin: roundToTwips(Math.min(...xs)),
    yMin: roundToTwips(Math.min(...ys)),
    xMax: roundToTwips(Math.max(...xs)),
    yMax: roundToTwips(Math.max(...ys)),
  };
}

export function unionRects(first: TwipsRect | null, second: TwipsRect | null): TwipsRect | null {
  if (first === null) return second;
  if (second === null) return first;
  return {
    xMin: Math.min(first.xMin, second.xMin),
    yMin: Math.min(first.yMin, second.yMin),
    xMax: Math.max(first.xMax, second.xMax),
    yMax: Math.max(first.yMax, second.yMax),
  };
}

export function lerpRect(start: TwipsRect, end: TwipsRect, t: number): TwipsRect {
  const lerp = (from: number, to: number): number => roundToTwips(from + (to - from) * t);
  return {
    xMin: lerp(start.xMin, end.xMin),
    yMin: lerp(start.yMin, end.yMin),
    xMax: lerp(start.xMax, end.xMax),
    yMax: lerp(start.yMax, end.yMax),
  };
}

export function rectWidth(rect: TwipsRect | null): number {
  return rect === null ? 0 : rect.xMax - rect.xMin;
}

export function rectHeight(rect: TwipsRect | null): number {
  return rect === null ? 0 : rect.yMax - rect.yMin;
}

export function rotationDegrees(matrix: TwipsMatrix): number {
  return Math.atan2(matrix.b, matrix.a) * RADIANS_TO_DEGREES;
}

export function toPixelMatrix(matrix: TwipsMatrix): PixelMatrix {
  return [matrix.a, matrix.b, matrix.c, matrix.d, twipsToPixels(matrix.tx), twipsToPixels(matrix.ty)];
}

export function toPixelRect(rect: TwipsRect): PixelRect {
  return {
    xMin: twipsToPixels(rect.xMin),
    yMin: twipsToPixels(rect.yMin),
    xMax: twipsToPixels(rect.xMax),
    yMax: twipsToPixels(rect.yMax),
  };
}
