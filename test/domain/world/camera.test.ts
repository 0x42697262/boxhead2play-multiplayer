import { describe, expect, it } from 'vitest';
import { cellToScreen, flashRange, followTarget, panFreeCamera, trackCamera } from '../../../src/domain/world/camera.ts';
import { FREE_CAMERA_SPEED_CELLS } from '../../../src/domain/world/tuning.ts';

const base = {
  last: undefined,
  smooth: false,
  viewWidth: 640,
  viewHeight: 480,
  areaWidthPx: 1280,
  areaHeightPx: 960,
  projectionFactor: 1,
};

describe('free camera of a dead player', () => {
  const area = { viewWidth: 640, viewHeight: 480, areaWidthPx: 1280, areaHeightPx: 960, projectionFactor: 1 };
  const still = { up: false, down: false, left: false, right: false };

  it('moves at a fixed speed, diagonals included, and flattens the height into y', () => {
    expect(panFreeCamera({ x: 20, y: 15, z: 0 }, { ...still, right: true }, area)).toEqual({ x: 20 + FREE_CAMERA_SPEED_CELLS, y: 15, z: 0 });
    const diagonal = panFreeCamera({ x: 20, y: 15, z: 0 }, { ...still, up: true, left: true }, area);
    expect(Math.hypot(diagonal.x - 20, diagonal.y - 15)).toBeCloseTo(FREE_CAMERA_SPEED_CELLS);
    expect(panFreeCamera({ x: 20, y: 15, z: 1 }, still, area)).toEqual({ x: 20, y: 16, z: 0 });
  });

  it('stops where the camera stops, so pressing back moves it at once', () => {
    expect(panFreeCamera({ x: 100, y: 100, z: 0 }, still, area)).toEqual({ x: 29, y: 21.5, z: 0 });
    expect(panFreeCamera({ x: -5, y: -5, z: 0 }, still, area)).toEqual({ x: 11, y: 8.5, z: 0 });
  });
});

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
