import { DEGREES_PER_HALF_TURN } from '../tuning.ts';

export type Matrix = readonly [a: number, b: number, c: number, d: number, tx: number, ty: number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a1, b1, c1, d1, tx1, ty1] = outer;
  const [a2, b2, c2, d2, tx2, ty2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * tx2 + c1 * ty2 + tx1,
    b1 * tx2 + d1 * ty2 + ty1,
  ];
}

export function concat(first: Matrix, then: Matrix): Matrix {
  return multiply(then, first);
}

export function translation(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

export function scaling(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0];
}

export function rotation(radians: number): Matrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
}

export function flashScale(m: Matrix, sx: number, sy: number): Matrix {
  return [m[0] * sx, m[1] * sy, m[2] * sx, m[3] * sy, m[4] * sx, m[5] * sy];
}

export function flashTranslate(m: Matrix, dx: number, dy: number): Matrix {
  return [m[0], m[1], m[2], m[3], m[4] + dx, m[5] + dy];
}

export function transformPoint(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function withRotationDegrees(m: Matrix, degrees: number): Matrix {
  const scaleX = Math.hypot(m[0], m[1]);
  const scaleY = Math.hypot(m[2], m[3]);
  const radians = (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [scaleX * cos, scaleX * sin, -scaleY * sin, scaleY * cos, m[4], m[5]];
}

export function isTranslationOnly(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1;
}
