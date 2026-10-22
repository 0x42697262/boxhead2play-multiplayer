import { describe, expect, it } from 'vitest';
import { matrix, rect, translate } from '../testing/fixtures.ts';
import {
  concatMatrices,
  lerpRect,
  rotationDegrees,
  snapFixed16,
  toPixelMatrix,
  toPixelRect,
  transformPoint,
  transformRect,
  unionRects,
} from './geometry.ts';

describe('matrix math', () => {
  it('applies the local matrix first, then the parent', () => {
    const parent = translate(100, 50);
    const local = matrix(0, 1, -1, 0, 10, 0);
    const combined = concatMatrices(parent, local);
    const point = transformPoint(combined, { x: 20, y: 0 });
    expect(point.x / 20).toBeCloseTo(110);
    expect(point.y / 20).toBeCloseTo(51);
  });

  it('derives Flash _rotation as atan2(b, a) in degrees', () => {
    expect(rotationDegrees(matrix(0, 1, -1, 0, 0, 0))).toBeCloseTo(90);
    expect(rotationDegrees(matrix(0, -1, 1, 0, 0, 0))).toBeCloseTo(-90);
    expect(rotationDegrees(matrix(-1, 0, 0, -1, 0, 0))).toBeCloseTo(180);
  });

  it('converts translation from twips to pixels', () => {
    expect(toPixelMatrix(matrix(1, 0, 0, 1, 336.95, 524.5))).toEqual([1, 0, 0, 1, 336.95, 524.5]);
  });

  it('snaps to the 16.16 fixed-point grid', () => {
    expect(snapFixed16(1.0999908) * 65536).toBe(72089);
  });
});

describe('bounds', () => {
  it('transforms the four corners and rounds to whole twips', () => {
    const scaled = transformRect(matrix(1.0999908447265625, 0, 0, 1, 0, 0), rect(0, 0, 640, 480));
    expect(toPixelRect(scaled)).toEqual({ xMin: 0, yMin: 0, xMax: 704, yMax: 480 });
    const rotated = transformRect(matrix(0, 1, -1, 0, 0, 0), rect(0, 0, 10, 20));
    expect(toPixelRect(rotated)).toEqual({ xMin: -20, yMin: 0, xMax: 0, yMax: 10 });
  });

  it('unions with null as the empty rectangle', () => {
    expect(unionRects(null, rect(1, 2, 3, 4))).toEqual(rect(1, 2, 3, 4));
    expect(unionRects(rect(0, 0, 1, 1), rect(2, -1, 3, 0))).toEqual(rect(0, -1, 3, 1));
  });

  it('interpolates morph bounds', () => {
    expect(lerpRect(rect(0, 0, 10, 10), rect(10, 10, 30, 30), 0.5)).toEqual(rect(5, 5, 20, 20));
  });
});
