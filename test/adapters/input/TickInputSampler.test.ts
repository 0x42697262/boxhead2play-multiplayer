import { describe, expect, it } from 'vitest';
import { codeForKeyCode } from '../../../src/adapters/input/keyCodes.ts';
import { KeyboardState } from '../../../src/adapters/input/KeyboardState.ts';
import { boundCodes, buildBindings, TickInputSampler } from '../../../src/adapters/input/TickInputSampler.ts';
import { DEFAULT_KEYS, ORIGINAL_KEYS } from '../../../src/services/SettingsService.ts';

const EXTRAS = { quitRequested: false, ambienceSamplesPlaying: 0 };

function sampler(): TickInputSampler {
  return new TickInputSampler(buildBindings(DEFAULT_KEYS));
}

describe('legacy key codes', () => {
  it('map to KeyboardEvent.code', () => {
    expect(codeForKeyCode(38)).toBe('ArrowUp');
    expect(codeForKeyCode(191)).toBe('Slash');
    expect(codeForKeyCode(190)).toBe('Period');
    expect(codeForKeyCode(188)).toBe('Comma');
    expect(codeForKeyCode(87)).toBe('KeyW');
    expect(codeForKeyCode(32)).toBe('Space');
    expect(codeForKeyCode(48)).toBe('Digit0');
    expect(codeForKeyCode(97)).toBe('Numpad1');
    expect(codeForKeyCode(1)).toBeUndefined();
  });

  it('bind WASD, SPACE, E and Q by default', () => {
    const bindings = buildBindings(DEFAULT_KEYS);
    expect(bindings.player.left).toEqual(['KeyA']);
    expect(bindings.player.nextWeapon).toEqual(['KeyE']);
    expect(bindings.player.prevWeapon).toEqual(['KeyQ']);
    expect(bindings.player.select3).toEqual(['Digit3']);
    expect(bindings.upgradeList).toEqual(['Tab']);
    expect(boundCodes(bindings).has('ArrowLeft')).toBe(false);
    expect(bindings.player.fire).toEqual(['Space']);
  });

  it('add space as a second fire key', () => {
    expect(buildBindings(ORIGINAL_KEYS).player.fire).toEqual(['Slash', 'Space']);
  });
});

describe('tick input sampling (CInput edges)', () => {
  it('reports a press once and counts held ticks', () => {
    const keyboard = new KeyboardState();
    const input = sampler();
    keyboard.keyDown('KeyA');
    keyboard.keyDown('KeyA');
    const first = input.sample(keyboard, EXTRAS).tick.players[0]?.left;
    const second = input.sample(keyboard, EXTRAS).tick.players[0]?.left;
    expect(first).toEqual({ down: true, pressed: true, released: false, heldTicks: 1 });
    expect(second).toEqual({ down: true, pressed: false, released: false, heldTicks: 2 });
    keyboard.keyUp('KeyA');
    expect(input.sample(keyboard, EXTRAS).tick.players[0]?.left).toEqual({ down: false, pressed: false, released: true, heldTicks: 0 });
  });

  it('keeps a tap between two ticks as a press and a release', () => {
    const keyboard = new KeyboardState();
    const input = sampler();
    keyboard.keyDown('Space');
    keyboard.keyUp('Space');
    expect(input.sample(keyboard, EXTRAS).tick.players[0]?.fire).toEqual({ down: false, pressed: true, released: true, heldTicks: 0 });
  });

  it('keeps edges until a tick consumes them', () => {
    const keyboard = new KeyboardState();
    const input = sampler();
    keyboard.keyDown('Tab');
    keyboard.keyUp('Tab');
    keyboard.keyDown('Tab');
    const sampled = input.sample(keyboard, { quitRequested: true, ambienceSamplesPlaying: 2 });
    expect(sampled.upgradeListPressed).toBe(true);
    expect(sampled.tick.quitRequested).toBe(true);
    expect(sampled.tick.ambienceSamplesPlaying).toBe(2);
    expect(input.sample(keyboard, EXTRAS).upgradeListPressed).toBe(false);
  });

  it('releases every key when the window loses focus', () => {
    const keyboard = new KeyboardState();
    const input = sampler();
    keyboard.keyDown('KeyW');
    input.sample(keyboard, EXTRAS);
    keyboard.releaseAll();
    expect(input.sample(keyboard, EXTRAS).tick.players[0]?.up).toEqual({ down: false, pressed: false, released: true, heldTicks: 0 });
  });
});
