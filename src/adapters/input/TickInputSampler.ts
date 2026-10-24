import { PlayerControl, type ControlState, type PlayerInput, type TickInput } from '../../domain/world/input.ts';
import { asciiKeyCode, codeForKeyCode, TAB_KEY_CODE } from './keyCodes.ts';
import type { KeyboardState } from './KeyboardState.ts';
import { TouchCode } from './touchCodes.ts';

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
  readonly player: PlayerBindings;
  readonly upgradeList: readonly string[];
  readonly playerList: readonly string[];
}

export interface SampleExtras {
  readonly quitRequested: boolean;
  readonly ambienceSamplesPlaying: number;
}

export interface SampledTick {
  readonly tick: TickInput;
  readonly upgradeListPressed: boolean;
}

export const UPGRADE_LIST_KEY_CODE = TAB_KEY_CODE;
export const PLAYER_LIST_CODES: readonly string[] = ['Backquote', TouchCode.PlayerList];
export const EXTRA_FIRE_KEY = ' ';
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
  return [...new Set(keyCodes.map(codeForKeyCode).filter((code): code is string => code !== undefined))];
}

function playerBindings(keys: PlayerKeyCodes, extraFire: readonly number[]): PlayerBindings {
  const bindings: Record<PlayerControl, readonly string[]> = Object.fromEntries(Object.values(PlayerControl).map((control) => [control, []])) as unknown as Record<
    PlayerControl,
    readonly string[]
  >;
  bindings.up = [...codes(keys.up), TouchCode.Up];
  bindings.down = [...codes(keys.down), TouchCode.Down];
  bindings.left = [...codes(keys.left), TouchCode.Left];
  bindings.right = [...codes(keys.right), TouchCode.Right];
  bindings.fire = [...codes(keys.fire, ...extraFire), TouchCode.Fire];
  bindings.nextWeapon = [...codes(keys.nextWeapon), TouchCode.NextWeapon];
  bindings.prevWeapon = [...codes(keys.prevWeapon), TouchCode.PrevWeapon];
  SELECT_CONTROLS.forEach((control, index) => {
    bindings[control] = codes(asciiKeyCode(SELECT_KEYS[index] ?? ''));
  });
  return bindings;
}

export function buildBindings(keys: PlayerKeyCodes): InputBindings {
  return {
    player: playerBindings(keys, [asciiKeyCode(EXTRA_FIRE_KEY)]),
    upgradeList: [...codes(UPGRADE_LIST_KEY_CODE), TouchCode.UpgradeList],
    playerList: PLAYER_LIST_CODES,
  };
}

export function boundCodes(bindings: InputBindings): ReadonlySet<string> {
  const all = new Set([...bindings.upgradeList, ...bindings.playerList]);
  for (const list of Object.values(bindings.player)) for (const code of list) all.add(code);
  return all;
}

export class TickInputSampler {
  private readonly held = new Map<string, number>();

  constructor(private readonly bindings: InputBindings) {}

  sample(keyboard: KeyboardState, extras: SampleExtras): SampledTick {
    const player = this.player(keyboard);
    const upgradeListPressed = this.upgradeListPressed(keyboard);
    keyboard.clearEdges();
    return { tick: { quitRequested: extras.quitRequested, players: [player], ambienceSamplesPlaying: extras.ambienceSamplesPlaying }, upgradeListPressed };
  }

  player(keyboard: KeyboardState): PlayerInput {
    const entries = Object.values(PlayerControl).map((control) => [control, this.control(keyboard, this.bindings.player[control], control)] as const);
    return Object.fromEntries(entries) as PlayerInput;
  }

  upgradeListPressed(keyboard: KeyboardState): boolean {
    return this.bindings.upgradeList.some((code) => keyboard.wasPressed(code));
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
