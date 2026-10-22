import { Direction, DIRECTION_COUNT, wrapDirection } from '../math/Direction.ts';
import type { Rng } from '../math/Rng.ts';
import { BlockedStraightMask, CollideMask, DirectionBit, DirectionBits } from './CollideFlag.ts';
import { shortTurnSign, type MapCell } from './MapCell.ts';
import { NAV_MAX_FULL_SCANS_PER_UPDATE, NAV_RINGS_PER_UPDATE, NAV_SCAN_TURN_STEPS, NAV_STRAIGHT_TURN_STEP } from './tuning.ts';

export const NavState = {
  Restart: 'restart',
  Resume: 'resume',
  Finished: 'finished',
} as const;

export type NavState = (typeof NavState)[keyof typeof NavState];

export const NO_DIRECTION = -1;

const RANDOM_TURN_CHOICES = 2;

const STRAIGHT_BLOCKS: readonly (readonly [Direction, number])[] = [
  [Direction.East, BlockedStraightMask.East],
  [Direction.South, BlockedStraightMask.South],
  [Direction.West, BlockedStraightMask.West],
  [Direction.North, BlockedStraightMask.North],
];

const DIAGONAL_BITS: readonly (readonly [Direction, number])[] = [
  [Direction.SouthEast, DirectionBit.SouthEast],
  [Direction.SouthWest, DirectionBit.SouthWest],
  [Direction.NorthWest, DirectionBit.NorthWest],
  [Direction.NorthEast, DirectionBit.NorthEast],
];

const FLOOD_DIRECTIONS: readonly Direction[] = [Direction.East, Direction.South, Direction.West, Direction.North];

export class NavigationField {
  private navState: NavState = NavState.Restart;
  private sessionId = 0;
  private clock = 0;
  private distance = 0;
  private frontier: MapCell[] = [];
  private fullScans = 0;

  constructor(
    private readonly rng: Rng,
    private readonly freshnessTicks: () => number,
  ) {}

  get state(): NavState {
    return this.navState;
  }

  get updates(): number {
    return this.clock;
  }

  reset(): void {
    this.navState = NavState.Restart;
    this.sessionId = 0;
    this.frontier = [];
  }

  restart(): void {
    if (this.navState === NavState.Finished) this.navState = NavState.Restart;
  }

  update(sources: readonly MapCell[]): void {
    this.clock++;
    this.fullScans = 0;
    if (this.navState === NavState.Restart) {
      this.frontier = [];
      this.sessionId = this.clock;
      this.distance = 0;
      for (const cell of sources.slice().reverse()) this.visit(cell);
    } else if (this.navState !== NavState.Resume) {
      return;
    }
    for (let ring = 0; ring < NAV_RINGS_PER_UPDATE && this.frontier.length > 0; ring++) this.expandRing();
    this.navState = this.frontier.length > 0 ? NavState.Resume : NavState.Finished;
  }

  isFresh(cell: MapCell): boolean {
    return this.clock - cell.navId < this.freshnessTicks();
  }

  direction(cell: MapCell, current: number, target: number, blockFlags: number, force: boolean): number {
    if (!this.isFresh(cell)) return this.directDirection(cell, target, current, blockFlags);
    if (isCloser(cell.adjacent(target), cell) && !(cell.collideFlagsToward(target) & blockFlags)) return target;
    if (isCloser(cell.adjacent(current), cell) && !(cell.collideFlagsToward(current) & blockFlags)) return current;
    if (!force && ++this.fullScans > NAV_MAX_FULL_SCANS_PER_UPDATE) return NO_DIRECTION;
    const valid = validDirections(cell, blockFlags);
    if (valid === 0) return NO_DIRECTION;
    const byDistanceDescending = directionsByDistanceDescending(cell);
    for (let i = byDistanceDescending.length - 1; i >= 0; i--) {
      const d = byDistanceDescending[i];
      if (d !== undefined && valid & (1 << d)) return d;
    }
    return NO_DIRECTION;
  }

  directDirection(cell: MapCell, target: number, current: number, blockFlags: number): number {
    if (!(cell.collideFlagsToward(target) & blockFlags)) return target;
    let turn: number;
    if (current !== target) {
      if (!(cell.collideFlagsToward(current) & blockFlags)) return current;
      turn = shortTurnSign(target, current);
    } else {
      turn = this.rng.int(RANDOM_TURN_CHOICES) * 2 - 1;
    }
    const steps: readonly number[] = target & 1 ? NAV_SCAN_TURN_STEPS : [NAV_STRAIGHT_TURN_STEP];
    for (const step of steps) {
      const forward = wrapDirection(target + step * turn);
      if (!(cell.collideFlagsToward(forward) & blockFlags)) return forward;
      const back = wrapDirection(target - step * turn);
      if (!(cell.collideFlagsToward(back) & blockFlags)) return back;
    }
    return NO_DIRECTION;
  }

  private expandRing(): void {
    const ring = this.frontier;
    this.frontier = [];
    for (let i = ring.length - 1; i >= 0; i--) {
      const cell = ring[i];
      if (!cell) continue;
      for (const d of FLOOD_DIRECTIONS) this.visit(cell.adjacent(d));
    }
    this.distance++;
  }

  private visit(cell: MapCell): void {
    if (cell.collide & CollideMask.Navigation || cell.navId === this.sessionId) return;
    cell.navId = this.sessionId;
    cell.navDist = this.distance;
    this.frontier.push(cell);
  }
}

export function validDirections(cell: MapCell, blockFlags: number): number {
  let valid: number = DirectionBits.All;
  for (const [direction, mask] of STRAIGHT_BLOCKS) {
    if (cell.adjacent(direction).collide & blockFlags) valid &= mask;
  }
  if (valid !== 0 && valid & DirectionBits.Diagonal) {
    for (const [direction, bit] of DIAGONAL_BITS) {
      if (valid & bit && cell.adjacent(direction).collide & blockFlags) valid &= ~bit;
    }
  }
  cell.navValidDirections = valid;
  return valid;
}

function isCloser(neighbour: MapCell, cell: MapCell): boolean {
  return neighbour.navDist !== undefined && cell.navDist !== undefined && neighbour.navDist < cell.navDist;
}

function directionsByDistanceDescending(cell: MapCell): number[] {
  const directions = Array.from({ length: DIRECTION_COUNT }, (_, d) => d);
  const distanceOf = (d: number): number => cell.adjacent(d).navDist ?? Number.POSITIVE_INFINITY;
  return directions.sort((a, b) => distanceOf(b) - distanceOf(a));
}
