import { PlayerControl, type ControlState, type PlayerInput } from '../../world/input.ts';
import type { FireControl } from '../weapons/Weapon.ts';

export class LatchedControl implements FireControl {
  timeDown = 0;
  timePressed = 0;
  private held = false;
  private latchedDown = false;
  private pressed = false;
  private released = false;

  sync(state: ControlState, tick: number): void {
    this.held = state.down;
    if ((state.down || state.pressed) && !this.latchedDown) {
      this.latchedDown = true;
      this.timeDown = tick;
      if (!this.pressed) {
        this.pressed = true;
        this.timePressed = tick;
      }
    }
    if (!state.down && this.latchedDown) {
      this.latchedDown = false;
      this.released = true;
    }
  }

  isDown(): boolean {
    return this.held;
  }

  isPressed(): boolean {
    if (!this.pressed) return false;
    this.pressed = false;
    return true;
  }

  isReleased(): boolean {
    if (!this.released) return false;
    this.released = false;
    this.pressed = false;
    return true;
  }

  renew(): void {
    this.released = false;
    this.pressed = false;
    this.latchedDown = false;
  }
}

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

export class PlayerControls {
  private readonly controls = new Map<PlayerControl, LatchedControl>(Object.values(PlayerControl).map((control) => [control, new LatchedControl()]));

  get left(): LatchedControl {
    return this.get(PlayerControl.Left);
  }

  get right(): LatchedControl {
    return this.get(PlayerControl.Right);
  }

  get up(): LatchedControl {
    return this.get(PlayerControl.Up);
  }

  get down(): LatchedControl {
    return this.get(PlayerControl.Down);
  }

  get fire(): LatchedControl {
    return this.get(PlayerControl.Fire);
  }

  get nextWeapon(): LatchedControl {
    return this.get(PlayerControl.NextWeapon);
  }

  get prevWeapon(): LatchedControl {
    return this.get(PlayerControl.PrevWeapon);
  }

  select(keyId: number): LatchedControl | undefined {
    const control = SELECT_CONTROLS[keyId];
    return control ? this.get(control) : undefined;
  }

  sync(input: PlayerInput, tick: number): void {
    for (const [control, latch] of this.controls) latch.sync(input[control], tick);
  }

  private get(control: PlayerControl): LatchedControl {
    const latch = this.controls.get(control);
    if (!latch) throw new Error(`Unknown control ${control}`);
    return latch;
  }
}
