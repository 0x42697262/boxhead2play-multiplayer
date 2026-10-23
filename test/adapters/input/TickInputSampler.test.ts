import { describe, expect, it } from 'vitest';
import { codeForKeyCode } from '../../../src/adapters/input/keyCodes.ts';
import { KeyboardState } from '../../../src/adapters/input/KeyboardState.ts';
import { boundCodes, buildBindings, TickInputSampler } from '../../../src/adapters/input/TickInputSampler.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { DEFAULT_PLAYER1_KEYS, DEFAULT_PLAYER2_KEYS } from '../../../src/services/SettingsService.ts';

const EXTRAS = { quitRequested: false, ambienceSamplesPlaying: 0 };

function sampler(mode: GameMode = GameMode.Single): TickInputSampler {
  return new TickInputSampler(buildBindings(DEFAULT_PLAYER1_KEYS, DEFAULT_PLAYER2_KEYS, mode));
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

  it('bind the original defaults', () => {
    const bindings = buildBindings(DEFAULT_PLAYER1_KEYS, DEFAULT_PLAYER2_KEYS, GameMode.Coop);
    expect(bindings.players[0]?.left).toEqual(['ArrowLeft']);
    expect(bindings.players[0]?.fire).toEqual(['Slash']);
    expect(bindings.players[1]?.fire).toEqual(['Space']);
    expect(bindings.players[1]?.prevWeapon).toEqual(['KeyQ']);
    expect(bindings.players[0]?.select3).toEqual(['Digit3']);
    expect(bindings.players[1]?.select3).toEqual([]);
    expect(bindings.pause).toEqual(['KeyP']);
    expect(boundCodes(bindings).has('KeyD')).toBe(true);
  });

  it('add space as a second fire key for player 1 in single player only', () => {
    expect(buildBindings(DEFAULT_PLAYER1_KEYS, DEFAULT_PLAYER2_KEYS, GameMode.Single).players[0]?.fire).toEqual(['Slash', 'Space']);
  });
});

describe('tick input sampling (CInput edges)', () => {
  it('reports a press once and counts held ticks', () => {
    const keyboard = new KeyboardState();
    const input = sampler();
    keyboard.keyDown('ArrowLeft');
    keyboard.keyDown('ArrowLeft');
    const first = input.sample(keyboard, EXTRAS).players[0]?.left;
    const second = input.sample(keyboard, EXTRAS).players[0]?.left;
    expect(first).toEqual({ down: true, pressed: true, released: false, heldTicks: 1 });
    expect(second).toEqual({ down: true, pressed: false, released: false, heldTicks: 2 });
    keyboard.keyUp('ArrowLeft');
    expect(input.sample(keyboard, EXTRAS).players[0]?.left).toEqual({ down: false, pressed: false, released: true, heldTicks: 0 });
  });

  it('keeps a tap between two ticks as a press and a release', () => {
    const keyboard = new KeyboardState();
    const input = sampler();
    keyboard.keyDown('Slash');
    keyboard.keyUp('Slash');
    expect(input.sample(keyboard, EXTRAS).players[0]?.fire).toEqual({ down: false, pressed: true, released: true, heldTicks: 0 });
  });

  it('keeps edges until a tick consumes them', () => {
    const keyboard = new KeyboardState();
    const input = sampler();
    keyboard.keyDown('KeyP');
    keyboard.keyUp('KeyP');
    keyboard.keyDown('KeyP');
    const tick = input.sample(keyboard, { quitRequested: true, ambienceSamplesPlaying: 2 });
    expect(tick.pausePressed).toBe(true);
    expect(tick.quitRequested).toBe(true);
    expect(tick.ambienceSamplesPlaying).toBe(2);
    expect(input.sample(keyboard, EXTRAS).pausePressed).toBe(false);
  });

  it('releases every key when the window loses focus', () => {
    const keyboard = new KeyboardState();
    const input = sampler(GameMode.Coop);
    keyboard.keyDown('KeyW');
    input.sample(keyboard, EXTRAS);
    keyboard.releaseAll();
    expect(input.sample(keyboard, EXTRAS).players[1]?.up).toEqual({ down: false, pressed: false, released: true, heldTicks: 0 });
  });
});
