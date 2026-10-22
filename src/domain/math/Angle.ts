import { FULL_TURN, Position } from './Position.ts';
import type { Direction } from './Direction.ts';
import { DIRECTION_COUNT, directionDelta, wrapDirection } from './Direction.ts';

const HALF_TURN = Math.PI;
const RADIANS_PER_DIRECTION = FULL_TURN / DIRECTION_COUNT;
const ANGLE_STEPS = 256;
const ANGLE_STEP_MASK = ANGLE_STEPS - 1;
const RADIANS_TO_STEPS = ANGLE_STEPS / FULL_TURN;
const WRAP_TURNS = 100;

export function normalizeRadians(radians: number): number {
  return (radians + FULL_TURN * WRAP_TURNS) % FULL_TURN;
}

export function radiansToDirection(radians: number): Direction {
  return wrapDirection(Math.round(radians / RADIANS_PER_DIRECTION));
}

export function directionToRadians(direction: Direction): number {
  return wrapDirection(direction) * RADIANS_PER_DIRECTION;
}

export class Angle {
  private value: number;

  constructor(radians = 0) {
    this.value = normalizeRadians(radians);
  }

  static fromDirection(direction: Direction): Angle {
    return new Angle(directionToRadians(direction));
  }

  clone(): Angle {
    return new Angle(this.value);
  }

  get radians(): number {
    return this.value;
  }

  set radians(radians: number) {
    this.value = normalizeRadians(radians);
  }

  get degrees(): number {
    return (this.value * 180) / HALF_TURN;
  }

  get direction(): Direction {
    return radiansToDirection(this.value);
  }

  set direction(direction: Direction) {
    this.value = directionToRadians(direction);
  }

  get oppositeDirection(): Direction {
    return wrapDirection(Math.round(this.value / RADIANS_PER_DIRECTION + DIRECTION_COUNT / 2));
  }

  get directionDelta(): Position {
    return directionDelta(this.direction);
  }

  get oppositeDirectionDelta(): Position {
    return directionDelta(this.oppositeDirection);
  }

  get delta(): Position {
    return new Position(Math.cos(this.value), Math.sin(this.value), 0);
  }

  set delta(d: Position) {
    this.value = normalizeRadians(Math.atan2(d.y, d.x));
  }

  get step256(): number {
    return Math.trunc(this.value * RADIANS_TO_STEPS) & ANGLE_STEP_MASK;
  }

  add(radians: number): this {
    this.value = normalizeRadians(this.value + radians);
    return this;
  }

  subtract(radians: number): this {
    this.value = normalizeRadians(this.value - radians);
    return this;
  }

  turnSign(target: Angle): number {
    if (target.value === this.value) return 0;
    const shortWay = Math.abs(target.value - this.value) <= HALF_TURN ? 1 : -1;
    return target.value <= this.value ? -shortWay : shortWay;
  }

  difference(target: Angle): number {
    const diff = target.value - this.value;
    if (diff < -HALF_TURN) return diff + FULL_TURN;
    if (diff > HALF_TURN) return diff - FULL_TURN;
    return diff;
  }

  toDirectionN(directionCount: number): number {
    return Math.round(this.value / (FULL_TURN / directionCount)) % directionCount;
  }

  toString(): string {
    return `Angle(${this.value})`;
  }
}

const lookupCache = new Map<number, readonly number[]>();

export function stepToDirectionLookup(directionCount: number): readonly number[] {
  const cached = lookupCache.get(directionCount);
  if (cached) return cached;
  const table: number[] = [];
  for (let step = 0; step < ANGLE_STEPS; step++) {
    table.push(Math.round(step / (ANGLE_STEPS / directionCount)) % directionCount);
  }
  lookupCache.set(directionCount, table);
  return table;
}

export function angleToDirectionIndex(angle: Angle, directionCount: number): number {
  return stepToDirectionLookup(directionCount)[angle.step256] ?? 0;
}
