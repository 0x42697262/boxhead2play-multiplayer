import { STICK_AXIS_THRESHOLD, STICK_DEAD_ZONE } from './tuning.ts';

export interface StickDirections {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LayoutBox {
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
}

export const STICK_IDLE: StickDirections = { up: false, down: false, left: false, right: false };

export function stickDirections(dx: number, dy: number, travel: number): StickDirections {
  const distance = Math.hypot(dx, dy);
  if (distance < travel * STICK_DEAD_ZONE) return STICK_IDLE;
  const x = dx / distance;
  const y = dy / distance;
  return { up: y < -STICK_AXIS_THRESHOLD, down: y > STICK_AXIS_THRESHOLD, left: x < -STICK_AXIS_THRESHOLD, right: x > STICK_AXIS_THRESHOLD };
}

export function knobOffset(dx: number, dy: number, travel: number): Point {
  const distance = Math.hypot(dx, dy);
  if (distance <= travel) return { x: dx, y: dy };
  return { x: (dx / distance) * travel, y: (dy / distance) * travel };
}

export function restCenter(parent: { readonly left: number; readonly top: number }, box: LayoutBox): Point {
  return { x: parent.left + box.offsetLeft + box.offsetWidth / 2, y: parent.top + box.offsetTop + box.offsetHeight / 2 };
}
