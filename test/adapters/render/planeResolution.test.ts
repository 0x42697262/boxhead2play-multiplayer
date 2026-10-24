import { describe, expect, it } from 'vitest';
import { planeArea, planeBudgetArea, planeResolution, type PlaneLimits } from '../../../src/adapters/render/world/planeResolution.ts';
import { RoomDetail } from '../../../src/services/roomDetail.ts';

const SAFARI_MAX_AREA = 16_777_216;
const ROOM_18 = { width: 2784, height: 2784 };
const ROOM_1 = { width: 704, height: 544 };
const SHARP_1080P = 2.25;
const GIB = 1024 ** 3;

function limits(budgetArea: number, maxArea = Number.POSITIVE_INFINITY): PlaneLimits {
  return { budgetArea, usableArea: (wanted) => Math.min(wanted, maxArea) };
}

describe('room plane resolution', () => {
  it('clamps room 18 at resolution 2.25 to an area Safari accepts, for HIGH and AUTO', () => {
    for (const detail of [RoomDetail.High, RoomDetail.Auto]) {
      const resolution = planeResolution(detail, SHARP_1080P, ROOM_18, limits(Number.POSITIVE_INFINITY, SAFARI_MAX_AREA));
      expect(resolution).toBe(1.25);
      expect(planeArea(ROOM_18, resolution)).toBeLessThanOrEqual(SAFARI_MAX_AREA);
    }
  });

  it('keeps the screen resolution for small rooms and for HIGH without a browser limit', () => {
    expect(planeResolution(RoomDetail.Auto, SHARP_1080P, ROOM_1, limits(planeBudgetArea({ memoryGiB: undefined, touch: true }), SAFARI_MAX_AREA))).toBe(SHARP_1080P);
    expect(planeResolution(RoomDetail.High, SHARP_1080P, ROOM_18, limits(0))).toBe(SHARP_1080P);
  });

  it('draws LOW at the original stage resolution', () => {
    expect(planeResolution(RoomDetail.Low, SHARP_1080P, ROOM_18, limits(Number.POSITIVE_INFINITY))).toBe(1);
    expect(planeResolution(RoomDetail.Low, SHARP_1080P, ROOM_1, limits(Number.POSITIVE_INFINITY))).toBe(1);
  });

  it('fits AUTO into the device budget in steps of 0.25, never below LOW', () => {
    const desktop = planeBudgetArea({ memoryGiB: 8, touch: false });
    const auto = planeResolution(RoomDetail.Auto, 3, ROOM_18, limits(desktop));
    expect(auto).toBe(1.5);
    expect(planeArea(ROOM_18, auto)).toBeLessThanOrEqual(desktop);
    expect(planeResolution(RoomDetail.Auto, 3, ROOM_18, limits(planeBudgetArea({ memoryGiB: 2, touch: true })))).toBe(1);
  });

  it('derives the per-plane budget from device memory, touch and fallbacks', () => {
    expect(planeBudgetArea({ memoryGiB: 8, touch: false })).toBe(Math.floor((8 * GIB) / 32 / 12));
    expect(planeBudgetArea({ memoryGiB: 8, touch: true })).toBe(Math.floor((8 * GIB) / 64 / 12));
    expect(planeBudgetArea({ memoryGiB: 0.25, touch: true })).toBe(4 * 1024 * 1024);
    expect(planeBudgetArea({ memoryGiB: undefined, touch: false })).toBe(16 * 1024 * 1024);
    expect(planeBudgetArea({ memoryGiB: undefined, touch: true })).toBe(8 * 1024 * 1024);
  });
});
