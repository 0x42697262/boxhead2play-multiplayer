import { GameMode } from '../../domain/world/GameMode.ts';
import { PlayerControl, type ControlState, type PlayerInput, type TickInput } from '../../domain/world/input.ts';
import { asciiKeyCode, codeForKeyCode } from './keyCodes.ts';
import type { KeyboardState } from './KeyboardState.ts';

export interface PlayerKeyCodes {
  readonly up: number;
  readonly down: number;
  readonly left: number;
  readonly right: number;
  readonly fire: number;
  readonly nextWeapon: number;
  readonly prevWeapon: number;
}

export type PlayerBindings = Readonly<Record<PlayerControl, readonly string[]>>;

export interface InputBindings {
  readonly players: readonly PlayerBindings[];
  readonly pause: readonly string[];
}

export interface SampleExtras {
  readonly quitRequested: boolean;
  readonly ambienceSamplesPlaying: number;
}

export const PAUSE_KEY = 'P';
export const SINGLE_PLAYER_EXTRA_FIRE_KEY = ' ';
export const SELECT_KEYS = '0123456789';

const SELECT_CONTROLS: readonly PlayerControl[] = [
  PlayerControl.Select0,
  PlayerControl.Select1,
  PlayerControl.Select2,
  PlayerControl.Select3,
  PlayerControl.Select4,
  PlayerControl.Select5,
  PlayerControl.Select6,
  PlayerControl.Select7,
  PlayerControl.Select8,
  PlayerControl.Select9,
];

function codes(...keyCodes: number[]): string[] {
  return keyCodes.map(codeForKeyCode).filter((code): code is string => code !== undefined);
}

function playerBindings(keys: PlayerKeyCodes, extraFire: readonly number[], withSelectKeys: boolean): PlayerBindings {
  const bindings: Record<PlayerControl, readonly string[]> = Object.fromEntries(Object.values(PlayerControl).map((control) => [control, []])) as unknown as Record<
    PlayerControl,
    readonly string[]
  >;
  bindings.up = codes(keys.up);
  bindings.down = codes(keys.down);
  bindings.left = codes(keys.left);
  bindings.right = codes(keys.right);
  bindings.fire = codes(keys.fire, ...extraFire);
  bindings.nextWeapon = codes(keys.nextWeapon);
  bindings.prevWeapon = codes(keys.prevWeapon);
  if (withSelectKeys) {
    SELECT_CONTROLS.forEach((control, index) => {
      bindings[control] = codes(asciiKeyCode(SELECT_KEYS[index] ?? ''));
    });
  }
  return bindings;
}

export function buildBindings(player1: PlayerKeyCodes, player2: PlayerKeyCodes, mode: GameMode): InputBindings {
  const single = mode === GameMode.Single;
  return {
    players: [playerBindings(player1, single ? [asciiKeyCode(SINGLE_PLAYER_EXTRA_FIRE_KEY)] : [], true), playerBindings(player2, [], false)],
    pause: codes(asciiKeyCode(PAUSE_KEY)),
  };
}

export function boundCodes(bindings: InputBindings): ReadonlySet<string> {
  const all = new Set(bindings.pause);
  for (const player of bindings.players) for (const list of Object.values(player)) for (const code of list) all.add(code);
  return all;
}

export class TickInputSampler {
  private readonly held = new Map<string, number>();

  constructor(private readonly bindings: InputBindings) {}

  sample(keyboard: KeyboardState, extras: SampleExtras): TickInput {
    const players = this.bindings.players.map((player, index) => this.player(keyboard, player, index));
    const pausePressed = this.bindings.pause.some((code) => keyboard.wasPressed(code));
    keyboard.clearEdges();
    return { pausePressed, quitRequested: extras.quitRequested, players, ambienceSamplesPlaying: extras.ambienceSamplesPlaying };
  }

  private player(keyboard: KeyboardState, bindings: PlayerBindings, index: number): PlayerInput {
    const entries = Object.values(PlayerControl).map((control) => [control, this.control(keyboard, bindings[control], `${index}:${control}`)] as const);
    return Object.fromEntries(entries) as PlayerInput;
  }

  private control(keyboard: KeyboardState, codes: readonly string[], key: string): ControlState {
    const down = codes.some((code) => keyboard.isDown(code));
    const pressed = codes.some((code) => keyboard.wasPressed(code));
    const released = !down && codes.some((code) => keyboard.wasReleased(code));
    const heldTicks = down ? (this.held.get(key) ?? 0) + 1 : 0;
    this.held.set(key, heldTicks);
    return { down, pressed, released, heldTicks };
  }
}
