import { describe, expect, it } from 'vitest';
import { KeyboardState } from '../../../src/adapters/input/KeyboardState.ts';
import { TOUCH_CODES, TouchCode } from '../../../src/adapters/input/touchCodes.ts';
import { TouchInputState } from '../../../src/ui/touch/TouchInputState.ts';
import { STICK_TRAVEL_PX } from '../../../src/ui/touch/tuning.ts';

const REST = { x: 100, y: 400 };
const THUMB = 7;
const OTHER_FINGER = 8;

function setup(): { keyboard: KeyboardState; input: TouchInputState } {
  const keyboard = new KeyboardState();
  return { keyboard, input: new TouchInputState(keyboard) };
}

const held = (keyboard: KeyboardState): string[] => TOUCH_CODES.filter((code) => keyboard.isDown(code));

describe('TouchInputState', () => {
  it('tracks one stick finger and presses the matching virtual keys', () => {
    const { keyboard, input } = setup();
    input.grabStick(THUMB, REST);
    expect(input.grabStick(OTHER_FINGER, REST)).toBe(false);
    expect(input.moveStick(OTHER_FINGER, { x: REST.x + STICK_TRAVEL_PX, y: REST.y })).toBeUndefined();
    expect(held(keyboard)).toEqual([]);
    expect(input.moveStick(THUMB, { x: REST.x + STICK_TRAVEL_PX * 2, y: REST.y })).toEqual({ x: STICK_TRAVEL_PX, y: 0 });
    expect(held(keyboard)).toEqual([TouchCode.Right]);
    input.moveStick(THUMB, { x: REST.x - STICK_TRAVEL_PX, y: REST.y + STICK_TRAVEL_PX });
    expect(held(keyboard)).toEqual([TouchCode.Down, TouchCode.Left]);
    input.endStick();
    expect(held(keyboard)).toEqual([]);
    expect(input.ownsStick(THUMB)).toBe(false);
  });

  it('keeps the stick centered on its fixed base wherever the thumb lands or drags', () => {
    const { keyboard, input } = setup();
    input.grabStick(THUMB, REST);
    input.moveStick(THUMB, { x: REST.x + STICK_TRAVEL_PX * 3, y: REST.y });
    expect(held(keyboard)).toEqual([TouchCode.Right]);
    input.moveStick(THUMB, { x: REST.x + STICK_TRAVEL_PX * 1.5, y: REST.y });
    expect(held(keyboard)).toEqual([TouchCode.Right]);
    input.moveStick(THUMB, { x: REST.x - STICK_TRAVEL_PX, y: REST.y });
    expect(held(keyboard)).toEqual([TouchCode.Left]);
  });

  it('presses the stick key again after a window blur released it, without leaving the sector', () => {
    const { keyboard, input } = setup();
    input.grabStick(THUMB, REST);
    input.moveStick(THUMB, { x: REST.x + STICK_TRAVEL_PX, y: REST.y });
    keyboard.releaseAll();
    expect(held(keyboard)).toEqual([]);
    input.moveStick(THUMB, { x: REST.x + STICK_TRAVEL_PX + 1, y: REST.y });
    expect(held(keyboard)).toEqual([TouchCode.Right]);
  });

  it('holds buttons as keys and releases everything at once', () => {
    const { keyboard, input } = setup();
    input.press(TouchCode.Fire);
    input.grabStick(THUMB, REST);
    input.moveStick(THUMB, { x: REST.x, y: REST.y - STICK_TRAVEL_PX });
    expect(input.isDown(TouchCode.Fire)).toBe(true);
    input.release(TouchCode.Fire);
    expect(input.isDown(TouchCode.Fire)).toBe(false);
    input.press(TouchCode.NextWeapon);
    input.releaseAll();
    expect(held(keyboard)).toEqual([]);
    expect(input.ownsStick(THUMB)).toBe(false);
  });
});
