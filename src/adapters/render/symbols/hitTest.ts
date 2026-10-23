import type { DisplayItem } from '../../assets/schemas.ts';
import { invert, transformPoint, type Matrix, type Point } from '../geometry/Matrix.ts';
import type { Rect } from '../geometry/Rect.ts';
import type { Overrides, SymbolLibrary } from './SymbolLibrary.ts';

export interface HitArea {
  readonly local: Rect;
  readonly matrix: Matrix;
}

export function rectContains(rect: Rect, point: Point): boolean {
  return point.x >= rect.xMin && point.x <= rect.xMax && point.y >= rect.yMin && point.y <= rect.yMax;
}

export function hitAreaContains(area: HitArea, point: Point): boolean {
  const inverse = invert(area.matrix);
  return inverse !== undefined && rectContains(area.local, transformPoint(inverse, point.x, point.y));
}

export function instanceHitArea(library: SymbolLibrary, rootItems: readonly DisplayItem[], path: readonly string[], overrides: Overrides): HitArea | undefined {
  const resolved = library.resolve(rootItems, path, overrides);
  if (!resolved?.visible) return undefined;
  const local = library.hitBounds(resolved.item.characterId, resolved.own);
  return local ? { local, matrix: resolved.matrix } : undefined;
}
