import type { KeyboardState } from '../../adapters/input/KeyboardState.ts';
import { TOUCH_CODES, TouchCode } from '../../adapters/input/touchCodes.ts';
import { knobOffset, STICK_IDLE, stickDirections, type Point, type StickDirections } from './stick.ts';
import { STICK_BASE_PX, STICK_GRAB_RADIUS_FACTOR, STICK_TRAVEL_PX } from './tuning.ts';

const STICK_KEYS: readonly (readonly [keyof StickDirections, TouchCode])[] = [
  ['up', TouchCode.Up],
  ['down', TouchCode.Down],
  ['left', TouchCode.Left],
  ['right', TouchCode.Right],
];

const GRAB_RADIUS_PX = (STICK_BASE_PX / 2) * STICK_GRAB_RADIUS_FACTOR;

export class TouchInputState {
  private stickPointer: number | undefined = undefined;
  private origin: Point = { x: 0, y: 0 };

  constructor(private readonly keyboard: KeyboardState) {}

  press(code: TouchCode): void {
    this.keyboard.keyDown(code);
  }

  release(code: TouchCode): void {
    this.keyboard.keyUp(code);
  }

  isDown(code: TouchCode): boolean {
    return this.keyboard.isDown(code);
  }

  grabStick(pointerId: number, touch: Point, rest: Point): Point | undefined {
    if (this.stickPointer !== undefined) return undefined;
    this.stickPointer = pointerId;
    this.origin = Math.hypot(touch.x - rest.x, touch.y - rest.y) <= GRAB_RADIUS_PX ? rest : touch;
    return this.origin;
  }

  moveStick(pointerId: number, touch: Point): Point | undefined {
    if (pointerId !== this.stickPointer) return undefined;
    const dx = touch.x - this.origin.x;
    const dy = touch.y - this.origin.y;
    this.steer(stickDirections(dx, dy, STICK_TRAVEL_PX));
    return knobOffset(dx, dy, STICK_TRAVEL_PX);
  }

  ownsStick(pointerId: number): boolean {
    return pointerId === this.stickPointer;
  }

  endStick(): void {
    this.stickPointer = undefined;
    this.steer(STICK_IDLE);
  }

  releaseAll(): void {
    for (const code of TOUCH_CODES) this.keyboard.keyUp(code);
    this.stickPointer = undefined;
  }

  private steer(next: StickDirections): void {
    for (const [direction, code] of STICK_KEYS) {
      if (next[direction] === this.keyboard.isDown(code)) continue;
      if (next[direction]) this.keyboard.keyDown(code);
      else this.keyboard.keyUp(code);
    }
  }
}
