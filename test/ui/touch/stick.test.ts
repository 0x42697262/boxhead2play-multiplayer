import { describe, expect, it } from 'vitest';
import { knobOffset, STICK_IDLE, stickDirections } from '../../../src/ui/touch/stick.ts';
import { STICK_DEAD_ZONE, STICK_TRAVEL_PX } from '../../../src/ui/touch/tuning.ts';

const TRAVEL = STICK_TRAVEL_PX;

describe('virtual stick', () => {
  it('stays idle inside the dead zone', () => {
    expect(stickDirections(0, 0, TRAVEL)).toEqual(STICK_IDLE);
    expect(stickDirections(TRAVEL * STICK_DEAD_ZONE * 0.9, 0, TRAVEL)).toEqual(STICK_IDLE);
  });

  it('maps a push to the same eight directions as WASD', () => {
    expect(stickDirections(TRAVEL, 0, TRAVEL)).toEqual({ up: false, down: false, left: false, right: true });
    expect(stickDirections(0, -TRAVEL, TRAVEL)).toEqual({ up: true, down: false, left: false, right: false });
    expect(stickDirections(-TRAVEL, TRAVEL, TRAVEL)).toEqual({ up: false, down: true, left: true, right: false });
    expect(stickDirections(TRAVEL, -TRAVEL * 0.3, TRAVEL)).toEqual({ up: false, down: false, left: false, right: true });
    expect(stickDirections(TRAVEL, -TRAVEL * 0.6, TRAVEL)).toEqual({ up: true, down: false, left: false, right: true });
  });

  it('keeps the knob inside the base however far the thumb goes', () => {
    expect(knobOffset(10, 0, TRAVEL)).toEqual({ x: 10, y: 0 });
    const far = knobOffset(TRAVEL * 3, TRAVEL * 4, TRAVEL);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(TRAVEL);
  });
});
