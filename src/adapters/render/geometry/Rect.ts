import { transformPoint, type Matrix } from './Matrix.ts';

export interface Rect {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
}

export function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  return { xMin: Math.min(a.xMin, b.xMin), yMin: Math.min(a.yMin, b.yMin), xMax: Math.max(a.xMax, b.xMax), yMax: Math.max(a.yMax, b.yMax) };
}

export function transformRect(rect: Rect, m: Matrix): Rect {
  const corners = [
    transformPoint(m, rect.xMin, rect.yMin),
    transformPoint(m, rect.xMax, rect.yMin),
    transformPoint(m, rect.xMin, rect.yMax),
    transformPoint(m, rect.xMax, rect.yMax),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return { xMin: Math.min(...xs), yMin: Math.min(...ys), xMax: Math.max(...xs), yMax: Math.max(...ys) };
}

export function inflate(rect: Rect, dx: number, dy: number): Rect {
  return { xMin: rect.xMin - dx, yMin: rect.yMin - dy, xMax: rect.xMax + dx, yMax: rect.yMax + dy };
}

export function pointsBounds(flat: readonly number[], halfStroke = 0): Rect | null {
  if (flat.length < 2) return null;
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const x = flat[index] as number;
    const y = flat[index + 1] as number;
    xMin = Math.min(xMin, x);
    yMin = Math.min(yMin, y);
    xMax = Math.max(xMax, x);
    yMax = Math.max(yMax, y);
  }
  return inflate({ xMin, yMin, xMax, yMax }, halfStroke, halfStroke);
}

export function width(rect: Rect): number {
  return rect.xMax - rect.xMin;
}

export function height(rect: Rect): number {
  return rect.yMax - rect.yMin;
}
