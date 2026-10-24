import { describe, expect, it } from 'vitest';
import { directionsOf, followOrigin, knobOffset, restCenter, STICK_IDLE, stickSector } from '../../../src/ui/touch/stick.ts';
import { STICK_DEAD_ZONE, STICK_TRAVEL_PX } from '../../../src/ui/touch/tuning.ts';

const TRAVEL = STICK_TRAVEL_PX;
const RIGHT = 0;
const DOWN_RIGHT = 1;
const LEFT = 4;
const UP = 6;

function at(degrees: number, distance = TRAVEL): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians) * distance, Math.sin(radians) * distance];
}

describe('virtual stick', () => {
  it('stays idle inside the dead zone', () => {
    expect(stickSector(0, 0, TRAVEL, undefined)).toBeUndefined();
    expect(stickSector(TRAVEL * STICK_DEAD_ZONE * 0.9, 0, TRAVEL, undefined)).toBeUndefined();
    expect(directionsOf(undefined)).toEqual(STICK_IDLE);
  });

  it('maps a push to the same eight directions as WASD', () => {
    expect(directionsOf(stickSector(TRAVEL, 0, TRAVEL, undefined))).toEqual({ up: false, down: false, left: false, right: true });
    expect(directionsOf(stickSector(0, -TRAVEL, TRAVEL, undefined))).toEqual({ up: true, down: false, left: false, right: false });
    expect(directionsOf(stickSector(-TRAVEL, TRAVEL, TRAVEL, undefined))).toEqual({ up: false, down: true, left: true, right: false });
    expect(stickSector(...at(-170), TRAVEL, undefined)).toBe(LEFT);
    expect(stickSector(...at(170), TRAVEL, undefined)).toBe(LEFT);
  });

  it('keeps the held direction while the thumb wobbles across a sector edge', () => {
    expect(stickSector(...at(20), TRAVEL, undefined)).toBe(RIGHT);
    expect(stickSector(...at(25), TRAVEL, RIGHT)).toBe(RIGHT);
    expect(stickSector(...at(32), TRAVEL, RIGHT)).toBe(RIGHT);
    expect(stickSector(...at(36), TRAVEL, RIGHT)).toBe(DOWN_RIGHT);
    expect(stickSector(...at(18), TRAVEL, DOWN_RIGHT)).toBe(DOWN_RIGHT);
    expect(stickSector(...at(-80), TRAVEL, UP)).toBe(UP);
    expect(stickSector(...at(179), TRAVEL, LEFT)).toBe(LEFT);
    expect(stickSector(...at(-179), TRAVEL, LEFT)).toBe(LEFT);
  });

  it('keeps moving while the thumb drifts back toward the center', () => {
    expect(stickSector(TRAVEL * STICK_DEAD_ZONE * 0.8, 0, TRAVEL, RIGHT)).toBe(RIGHT);
    expect(stickSector(TRAVEL * STICK_DEAD_ZONE * 0.5, 0, TRAVEL, RIGHT)).toBeUndefined();
  });

  it('drags the origin along only past the rim', () => {
    expect(followOrigin({ x: 0, y: 0 }, { x: TRAVEL * 3, y: 0 }, TRAVEL)).toEqual({ x: TRAVEL * 2, y: 0 });
    expect(followOrigin({ x: 5, y: 5 }, { x: 10, y: 5 }, TRAVEL)).toEqual({ x: 5, y: 5 });
  });

  it('keeps the knob inside the base however far the thumb goes', () => {
    expect(knobOffset(10, 0, TRAVEL)).toEqual({ x: 10, y: 0 });
    const far = knobOffset(TRAVEL * 3, TRAVEL * 4, TRAVEL);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(TRAVEL);
  });
});

describe('stick rest center', () => {
  it('comes from the layout box, so a running spring-back transform does not move it', () => {
    expect(restCenter({ left: 0, top: 200 }, { offsetLeft: 20, offsetTop: 300, offsetWidth: 132, offsetHeight: 132 })).toEqual({ x: 86, y: 566 });
  });
});
