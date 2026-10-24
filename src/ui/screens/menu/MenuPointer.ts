import { ButtonState } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import { Cursor, PointerPhase, type PointerInput, type StagePoint } from '../../../services/ScreenFlow.ts';

export const Trigger = {
  Press: 'press',
  Release: 'release',
  Block: 'block',
} as const;

export type Trigger = (typeof Trigger)[keyof typeof Trigger];

export interface MenuTarget<Action> {
  readonly path: readonly string[];
  readonly trigger: Trigger;
  readonly action?: Action;
}

export function mapTargets<From, To>(targets: readonly MenuTarget<From>[], wrap: (action: From) => To): MenuTarget<To>[] {
  return targets.map(({ action, ...target }) => (action === undefined ? target : { ...target, action: wrap(action) }));
}

export type TargetHit<Action> = (point: StagePoint) => MenuTarget<Action> | undefined;

function samePath(first: readonly string[] | undefined, second: readonly string[] | undefined): boolean {
  return first !== undefined && second !== undefined && first.length === second.length && first.every((name, index) => name === second[index]);
}

export class MenuPointer<Action> {
  private hovered: MenuTarget<Action> | undefined = undefined;
  private pressed: MenuTarget<Action> | undefined = undefined;
  private point: StagePoint | undefined = undefined;

  get hoveredTarget(): MenuTarget<Action> | undefined {
    return this.hovered;
  }

  get cursor(): Cursor {
    return this.hovered && this.hovered.trigger !== Trigger.Block ? Cursor.Hand : Cursor.Default;
  }

  observe(input: PointerInput): void {
    this.point = input.phase === PointerPhase.Leave ? undefined : input.point;
    this.hovered = undefined;
    this.pressed = undefined;
  }

  handle(input: PointerInput, hit: TargetHit<Action>): Action | undefined {
    if (input.phase === PointerPhase.Leave) {
      this.point = undefined;
      this.hovered = undefined;
      return undefined;
    }
    this.point = input.point;
    this.hovered = hit(input.point);
    const target = this.hovered;
    switch (input.phase) {
      case PointerPhase.Down:
        this.pressed = target;
        return target?.trigger === Trigger.Press ? target.action : undefined;
      case PointerPhase.Up: {
        const pressed = this.pressed;
        this.pressed = undefined;
        return pressed?.trigger === Trigger.Release && samePath(pressed.path, target?.path) ? pressed.action : undefined;
      }
      default:
        return undefined;
    }
  }

  refresh(hit: TargetHit<Action>): void {
    this.hovered = this.point ? hit(this.point) : undefined;
  }

  isHovered(path: readonly string[]): boolean {
    return samePath(this.hovered?.path, path);
  }

  buttonState(path: readonly string[]): ButtonState {
    if (!this.isHovered(path)) return ButtonState.Up;
    if (this.pressed === undefined) return ButtonState.Over;
    return samePath(this.pressed.path, path) ? ButtonState.Down : ButtonState.Up;
  }
}
