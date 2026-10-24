import { STICK_DEAD_ZONE, STICK_RELEASE_FACTOR, STICK_SECTOR_HYSTERESIS_RADIANS } from './tuning.ts';

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

const SECTORS = 8;
const FULL_TURN = 2 * Math.PI;
const SECTOR_RADIANS = FULL_TURN / SECTORS;
const SECTOR_DIRECTIONS: readonly StickDirections[] = [
  { up: false, down: false, left: false, right: true },
  { up: false, down: true, left: false, right: true },
  { up: false, down: true, left: false, right: false },
  { up: false, down: true, left: true, right: false },
  { up: false, down: false, left: true, right: false },
  { up: true, down: false, left: true, right: false },
  { up: true, down: false, left: false, right: false },
  { up: true, down: false, left: false, right: true },
];

export function directionsOf(sector: number | undefined): StickDirections {
  return sector === undefined ? STICK_IDLE : (SECTOR_DIRECTIONS[sector] ?? STICK_IDLE);
}

function angleBetween(a: number, b: number): number {
  const difference = Math.abs(a - b) % FULL_TURN;
  return Math.min(difference, FULL_TURN - difference);
}

export function stickSector(dx: number, dy: number, travel: number, held: number | undefined): number | undefined {
  const deadZone = travel * STICK_DEAD_ZONE * (held === undefined ? 1 : STICK_RELEASE_FACTOR);
  if (Math.hypot(dx, dy) < deadZone) return undefined;
  const angle = Math.atan2(dy, dx);
  if (held !== undefined && angleBetween(angle, held * SECTOR_RADIANS) <= SECTOR_RADIANS / 2 + STICK_SECTOR_HYSTERESIS_RADIANS) return held;
  return (Math.round(angle / SECTOR_RADIANS) + SECTORS) % SECTORS;
}

export function knobOffset(dx: number, dy: number, travel: number): Point {
  const distance = Math.hypot(dx, dy);
  if (distance <= travel) return { x: dx, y: dy };
  return { x: (dx / distance) * travel, y: (dy / distance) * travel };
}

export function restCenter(parent: { readonly left: number; readonly top: number }, box: LayoutBox): Point {
  return { x: parent.left + box.offsetLeft + box.offsetWidth / 2, y: parent.top + box.offsetTop + box.offsetHeight / 2 };
}
