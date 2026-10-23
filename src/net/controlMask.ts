import { PlayerControl, type ControlState, type PlayerInput } from '../domain/world/input.ts';

export const CONTROL_ORDER: readonly PlayerControl[] = Object.values(PlayerControl);
export const CONTROL_MASK_LIMIT = 2 ** CONTROL_ORDER.length;

const BIT = 1;

export function controlBit(control: PlayerControl): number {
  return BIT << CONTROL_ORDER.indexOf(control);
}

export interface ControlMasks {
  readonly down: number;
  readonly pressed: number;
  readonly released: number;
}

export const IDLE_MASKS: ControlMasks = { down: 0, pressed: 0, released: 0 };

export function masksOf(input: PlayerInput): ControlMasks {
  let down = 0;
  let pressed = 0;
  let released = 0;
  for (const control of CONTROL_ORDER) {
    const state = input[control];
    const bit = controlBit(control);
    if (state.down) down |= bit;
    if (state.pressed) pressed |= bit;
    if (state.released) released |= bit;
  }
  return { down, pressed, released };
}

export function sameMasks(first: ControlMasks, second: ControlMasks): boolean {
  return first.down === second.down && first.pressed === second.pressed && first.released === second.released;
}

export class RemoteControls {
  private down = 0;
  private pressed = 0;
  private released = 0;
  private readonly held = new Map<PlayerControl, number>();

  receive(masks: ControlMasks): void {
    this.pressed |= masks.pressed;
    this.released |= masks.released;
    this.down = masks.down;
  }

  releaseAll(): void {
    this.released |= this.down;
    this.down = 0;
  }

  sample(): PlayerInput {
    const entries = CONTROL_ORDER.map((control) => [control, this.control(control)] as const);
    this.pressed = 0;
    this.released = 0;
    return Object.fromEntries(entries) as PlayerInput;
  }

  private control(control: PlayerControl): ControlState {
    const bit = controlBit(control);
    const down = (this.down & bit) !== 0;
    const heldTicks = down ? (this.held.get(control) ?? 0) + 1 : 0;
    this.held.set(control, heldTicks);
    return { down, pressed: (this.pressed & bit) !== 0, released: !down && (this.released & bit) !== 0, heldTicks };
  }
}
