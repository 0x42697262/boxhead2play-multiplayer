import type { KeyboardState } from '../../adapters/input/KeyboardState.ts';
import { TOUCH_CODES, TouchCode } from '../../adapters/input/touchCodes.ts';
import { directionsOf, knobOffset, STICK_IDLE, stickSector, type Point, type StickDirections } from './stick.ts';
import { STICK_TRAVEL_PX } from './tuning.ts';

const STICK_KEYS: readonly (readonly [keyof StickDirections, TouchCode])[] = [
  ['up', TouchCode.Up],
  ['down', TouchCode.Down],
  ['left', TouchCode.Left],
  ['right', TouchCode.Right],
];

export class TouchInputState {
  private stickPointer: number | undefined = undefined;
  private origin: Point = { x: 0, y: 0 };
  private sector: number | undefined = undefined;

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

  grabStick(pointerId: number, center: Point): boolean {
    if (this.stickPointer !== undefined) return false;
    this.stickPointer = pointerId;
    this.sector = undefined;
    this.origin = center;
    return true;
  }

  moveStick(pointerId: number, touch: Point): Point | undefined {
    if (pointerId !== this.stickPointer) return undefined;
    const dx = touch.x - this.origin.x;
    const dy = touch.y - this.origin.y;
    this.sector = stickSector(dx, dy, STICK_TRAVEL_PX, this.sector);
    this.steer(directionsOf(this.sector));
    return knobOffset(dx, dy, STICK_TRAVEL_PX);
  }

  ownsStick(pointerId: number): boolean {
    return pointerId === this.stickPointer;
  }

  endStick(): void {
    this.stickPointer = undefined;
    this.sector = undefined;
    this.steer(STICK_IDLE);
  }

  releaseAll(): void {
    for (const code of TOUCH_CODES) this.keyboard.keyUp(code);
    this.stickPointer = undefined;
    this.sector = undefined;
  }

  private steer(next: StickDirections): void {
    for (const [direction, code] of STICK_KEYS) {
      if (next[direction] === this.keyboard.isDown(code)) continue;
      if (next[direction]) this.keyboard.keyDown(code);
      else this.keyboard.keyUp(code);
    }
  }
}
