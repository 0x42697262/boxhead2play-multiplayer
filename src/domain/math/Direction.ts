import { Position } from './Position.ts';

export const Direction = {
  East: 0,
  SouthEast: 1,
  South: 2,
  SouthWest: 3,
  West: 4,
  NorthWest: 5,
  North: 6,
  NorthEast: 7,
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export const DIRECTION_COUNT = 8;
const DIRECTION_MASK = DIRECTION_COUNT - 1;
export const STRAIGHT_DIRECTION_STEP = 2;

export const ALL_DIRECTIONS: readonly Direction[] = [
  Direction.East,
  Direction.SouthEast,
  Direction.South,
  Direction.SouthWest,
  Direction.West,
  Direction.NorthWest,
  Direction.North,
  Direction.NorthEast,
];

const DELTAS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

export function wrapDirection(value: number): Direction {
  return (value & DIRECTION_MASK) as Direction;
}

export function directionDelta(direction: Direction): Position {
  const [dx, dy] = DELTAS[direction] ?? [0, 0];
  return new Position(dx, dy, 0);
}

export function directionDeltaX(direction: Direction): number {
  return DELTAS[direction]?.[0] ?? 0;
}

export function directionDeltaY(direction: Direction): number {
  return DELTAS[direction]?.[1] ?? 0;
}

export function isDiagonal(direction: Direction): boolean {
  return direction % STRAIGHT_DIRECTION_STEP === 1;
}

export function oppositeDirection(direction: Direction): Direction {
  return wrapDirection(direction + DIRECTION_COUNT / 2);
}
