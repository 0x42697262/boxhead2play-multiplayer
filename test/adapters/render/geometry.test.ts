import { describe, expect, it } from 'vitest';
import { bufferLayout } from '../../../src/adapters/render/clips/bufferLayout.ts';
import { concat, flashScale, IDENTITY, multiply, rotation, transformPoint, translation, withRotationDegrees } from '../../../src/adapters/render/geometry/Matrix.ts';
import { pointsBounds, transformRect, union } from '../../../src/adapters/render/geometry/Rect.ts';

describe('matrices', () => {
  it('multiply applies the inner matrix first', () => {
    const m = multiply(translation(10, 0), flashScale(IDENTITY, 2, 2));
    expect(transformPoint(m, 1, 1)).toEqual({ x: 12, y: 2 });
    expect(concat(flashScale(IDENTITY, 2, 2), translation(10, 0))).toEqual(m);
  });

  it('rotation follows Flash axes (y down, clockwise on screen)', () => {
    const point = transformPoint(rotation(Math.PI / 2), 1, 0);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(1);
  });

  it('setting _rotation keeps scale and translation', () => {
    const m = withRotationDegrees([2, 0, 0, 3, 5, 6], 90);
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(2);
    expect(m[2]).toBeCloseTo(-3);
    expect(m[3]).toBeCloseTo(0);
    expect(m.slice(4)).toEqual([5, 6]);
  });

  it('transforms and unites rectangles', () => {
    const rect = transformRect({ xMin: 0, yMin: 0, xMax: 2, yMax: 1 }, rotation(Math.PI / 2));
    expect(rect.xMin).toBeCloseTo(-1);
    expect(rect.yMax).toBeCloseTo(2);
    expect(union(null, rect)).toBe(rect);
    expect(pointsBounds([1, 2, -3, 4], 1)).toEqual({ xMin: -4, yMin: 1, xMax: 2, yMax: 5 });
  });
});

describe('buffer layout (RenderMovieClipAsBitmapObject)', () => {
  it('floors and ceils bounds, scales, inflates, and floors the displacement', () => {
    const layout = bufferLayout({ xMin: -10.5, yMin: -4.2, xMax: 10.5, yMax: 4.2 }, 1, 0.6, 8);
    expect(layout.width).toBe(38);
    expect(layout.height).toBe(Math.ceil(10 * 0.6 + 16));
    expect(layout.dispX).toBe(-19);
    expect(layout.dispY).toBe(Math.floor((-5 - 8) * 0.6));
    expect(layout.matrix).toEqual([1, 0, 0, 0.6, 19, -layout.dispY]);
  });

  it('at a higher resolution is the same layout in device pixels, with the whole clip inside', () => {
    const bounds = { xMin: -10.5, yMin: -4.2, xMax: 10.5, yMax: 4.2 };
    const double = bufferLayout(bounds, 1, 0.6, 8, 2);
    expect(double).toMatchObject({ width: 76, dispX: -38 });
    for (const resolution of [1, 1.25, 2.25, 3]) {
      for (const [scaleX, scaleY] of [[1, 1], [1, 0.6], [0.35, 0.35]] as const) {
        const layout = bufferLayout(bounds, scaleX, scaleY, 8, resolution);
        expect(bounds.xMin * scaleX * resolution - layout.dispX).toBeGreaterThanOrEqual(0);
        expect(bounds.yMin * scaleY * resolution - layout.dispY).toBeGreaterThanOrEqual(0);
        expect(bounds.xMax * scaleX * resolution - layout.dispX).toBeLessThanOrEqual(layout.width);
        expect(bounds.yMax * scaleY * resolution - layout.dispY).toBeLessThanOrEqual(layout.height);
      }
    }
  });

  it('gives empty clips a one pixel bitmap', () => {
    expect(bufferLayout(null, 1, 1, 8)).toMatchObject({ width: 1, height: 1, dispX: 0, dispY: 0 });
  });

  it('scales XSI bounds before inflating by 2', () => {
    const layout = bufferLayout({ xMin: -40, yMin: -120, xMax: 40, yMax: 10 }, 0.35, 0.35, 2);
    expect(layout).toMatchObject({ width: 32, height: 50, dispX: -15, dispY: -43 });
  });
});
