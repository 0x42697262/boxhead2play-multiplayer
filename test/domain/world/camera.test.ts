import { describe, expect, it } from 'vitest';
import { cellToScreen, flashRange, followTarget, trackCamera } from '../../../src/domain/world/camera.ts';

const base = {
  last: undefined,
  smooth: false,
  viewWidth: 640,
  viewHeight: 480,
  areaWidthPx: 1280,
  areaHeightPx: 960,
  projectionFactor: 1,
};

describe('camera tracking', () => {
  it('clamps like CMath.Range, which returns max when min > max', () => {
    expect(flashRange(5, 0, 10)).toBe(5);
    expect(flashRange(-5, 0, 10)).toBe(0);
    expect(flashRange(50, 0, 10)).toBe(10);
    expect(flashRange(20, 32, -10)).toBe(-10);
    expect(flashRange(-20, 32, -10)).toBe(32);
  });

  it('projects height with the tilt factor', () => {
    expect(cellToScreen({ x: 1, y: 2, z: 0.5 }, -0.5)).toEqual({ x: 32, y: 56 });
  });

  it('centres on the target and keeps a one-cell margin at the room edges', () => {
    expect(trackCamera({ ...base, target: { x: 20, y: 15, z: 0 } }).rect).toMatchObject({ x: 320, y: 240 });
    expect(trackCamera({ ...base, target: { x: 1, y: 1, z: 0 } }).rect).toMatchObject({ x: 32, y: 32 });
    expect(trackCamera({ ...base, target: { x: 39, y: 29, z: 0 } }).rect).toMatchObject({ x: 608, y: 448 });
  });

  it('pins small rooms to the far margin', () => {
    expect(trackCamera({ ...base, areaWidthPx: 640, target: { x: 10, y: 15, z: 0 } }).rect.x).toBe(-32);
  });

  it('falls back to the origin with nothing to track', () => {
    expect(trackCamera({ ...base, target: undefined }).rect).toMatchObject({ x: 32, y: 32 });
  });

  it('follows at 0.16 cells per tick, catching up faster when far behind', () => {
    expect(followTarget({ x: 0.1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toEqual({ x: 0.1, y: 0, z: 0 });
    expect(followTarget({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })?.x).toBeCloseTo(0.18688);
    expect(followTarget({ x: 5.16, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })?.x).toBeCloseTo(0.32);
    expect(followTarget(undefined, { x: 3, y: 0, z: 0 })).toEqual({ x: 3, y: 0, z: 0 });
  });
});
