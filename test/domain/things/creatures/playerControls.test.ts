import { describe, expect, it } from 'vitest';
import { LatchedControl } from '../../../../src/domain/things/creatures/PlayerControls.ts';
import { IDLE_CONTROL } from '../../../../src/domain/world/input.ts';

const down = { ...IDLE_CONTROL, down: true };
const tap = { ...IDLE_CONTROL, pressed: true, released: true };

describe('LatchedControl', () => {
  it('latches a press until it is read once and remembers when it happened', () => {
    const key = new LatchedControl();
    key.sync(down, 7);
    key.sync(down, 8);
    expect(key.timePressed).toBe(7);
    expect(key.isPressed()).toBe(true);
    expect(key.isPressed()).toBe(false);
    key.sync(IDLE_CONTROL, 9);
    expect(key.isReleased()).toBe(true);
    expect(key.isReleased()).toBe(false);
  });

  it('keeps a tap that went down and up inside one tick', () => {
    const key = new LatchedControl();
    key.sync(tap, 3);
    expect(key.isDown()).toBe(false);
    expect(key.isReleased()).toBe(true);
    expect(key.isPressed()).toBe(false);
  });

  it('re-latches a key that is still held after renew', () => {
    const key = new LatchedControl();
    key.sync(down, 1);
    key.renew();
    expect(key.isPressed()).toBe(false);
    key.sync(down, 2);
    expect(key.isPressed()).toBe(true);
    expect(key.timePressed).toBe(2);
  });
});
