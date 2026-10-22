import { CELL_CENTRE_OFFSET, Position } from '../math/Position.ts';
import { DIRECTION_COUNT, Direction, wrapDirection } from '../math/Direction.ts';
import type { Affect } from '../things/affects/Affect.ts';
import type { Thing } from '../things/Thing.ts';
import type { ThingClass } from '../things/ThingClass.ts';
import { CollideFlag, CollideMask } from './CollideFlag.ts';
import type { CellId } from './CellRect.ts';
import { LineTest, type LineProbe } from './LineProbe.ts';
import { HALF_DIRECTION_RANGE, NAV_SCAN_TURN_STEPS, NAV_STRAIGHT_TURN_STEP } from './tuning.ts';

export interface MutablePoint {
  x: number;
  y: number;
}

export const LineHitKind = {
  Wall: 'wall',
  Thing: 'thing',
} as const;

export type LineHit =
  | { readonly kind: typeof LineHitKind.Wall; readonly poi: MutablePoint }
  | { readonly kind: typeof LineHitKind.Thing; readonly thing: Thing; readonly poi: MutablePoint };

export const NAV_UNVISITED = Number.NEGATIVE_INFINITY;

export class MapCell implements CellId {
  readonly centre: Position;
  collide: number = CollideFlag.None;
  sessionCheck = 0;
  navId = NAV_UNVISITED;
  navDist: number | undefined = undefined;
  navValidDirections = 0;
  private readonly occupants: Thing[] = [];
  private adjacents: readonly MapCell[] = [];

  constructor(
    readonly x: number,
    readonly y: number,
  ) {
    this.centre = new Position(x + CELL_CENTRE_OFFSET, y + CELL_CENTRE_OFFSET, 0);
  }

  setAdjacents(cells: readonly MapCell[]): void {
    this.adjacents = cells;
  }

  adjacent(direction: number): MapCell {
    const cell = this.adjacents[wrapDirection(direction)];
    if (!cell) throw new Error(`Cell (${this.x}, ${this.y}) has no adjacency table`);
    return cell;
  }

  get east(): MapCell {
    return this.adjacent(Direction.East);
  }

  get south(): MapCell {
    return this.adjacent(Direction.South);
  }

  get west(): MapCell {
    return this.adjacent(Direction.West);
  }

  get north(): MapCell {
    return this.adjacent(Direction.North);
  }

  get childCount(): number {
    return this.occupants.length;
  }

  get things(): readonly Thing[] {
    return this.occupants;
  }

  newestFirst(): Thing[] {
    return this.occupants.slice().reverse();
  }

  addThing(thing: Thing): void {
    this.occupants.push(thing);
  }

  deleteThing(thing: Thing): void {
    const index = this.occupants.indexOf(thing);
    if (index >= 0) this.occupants.splice(index, 1);
  }

  findClass(classId: ThingClass): Thing | undefined {
    for (let i = this.occupants.length - 1; i >= 0; i--) {
      const thing = this.occupants[i];
      if (thing?.classId === classId) return thing;
    }
    return undefined;
  }

  affect(affect: Affect): void {
    for (const thing of this.newestFirst()) {
      if (thing.affectFlags & affect.type && affect.affector.id !== thing.id) thing.affect(affect);
    }
  }

  collideFlagsToward(direction: number): number {
    const d = wrapDirection(direction);
    const flags = this.adjacent(d).collide;
    if (!(d & 1)) return flags;
    return flags | this.adjacent(d - 1).collide | this.adjacent(d + 1).collide;
  }

  clearMoveDirection(preferred: number, current: number): number {
    const turn = shortTurnSign(preferred, current);
    if (preferred & 1) {
      for (const step of NAV_SCAN_TURN_STEPS) {
        const forward = wrapDirection(preferred + step * turn);
        if (!(this.collideFlagsToward(forward) & CollideMask.NonMovable)) return forward;
        const back = wrapDirection(preferred - step * turn);
        if (!(this.collideFlagsToward(back) & CollideMask.NonMovable)) return back;
      }
      return -1;
    }
    const forward = wrapDirection(preferred + NAV_STRAIGHT_TURN_STEP * turn);
    if (!(this.collideFlagsToward(forward) & CollideMask.NonMovable)) return forward;
    const back = wrapDirection(preferred - NAV_STRAIGHT_TURN_STEP * turn);
    if (!(this.collideFlagsToward(back) & CollideMask.NonMovable)) return back;
    return -1;
  }

  validMoveNeighbour(): MapCell | undefined {
    for (let d = 0; d < DIRECTION_COUNT; d += NAV_STRAIGHT_TURN_STEP) {
      const cell = this.adjacent(d);
      if ((cell.collide & CollideMask.StaticImpassable) === 0) return cell;
    }
    return undefined;
  }

  lineIntersection(line: LineProbe): LineHit | undefined {
    const wall = this.lineIntersectionWall(line);
    if (wall || line.test === LineTest.WallsOnly) return wall;
    for (let i = this.occupants.length - 1; i >= 0; i--) {
      const thing = this.occupants[i];
      if (!thing || line.ownerId === thing.id || !(thing.affectFlags & line.affectFlags)) continue;
      const { x, y } = thing.position;
      if (line.distanceToLineSquared(x, y) < thing.radiusSquared) {
        return { kind: LineHitKind.Thing, thing, poi: { x, y } };
      }
    }
    return undefined;
  }

  lineIntersectionThings(line: LineProbe): Thing[] | undefined {
    const hits: Thing[] = [];
    for (let i = this.occupants.length - 1; i >= 0; i--) {
      const thing = this.occupants[i];
      if (!thing || line.ownerId === thing.id || !(thing.affectFlags & line.affectFlags)) continue;
      if (line.distanceToLineSquared(thing.position.x, thing.position.y) < thing.radiusSquared) hits.push(thing);
    }
    return hits.length > 0 ? hits : undefined;
  }

  lineIntersectionWall(line: LineProbe): LineHit | undefined {
    if ((this.collide & CollideFlag.Solid) !== CollideFlag.Solid) return undefined;
    const left = this.x;
    const top = this.y;
    const right = this.x + 1;
    const bottom = this.y + 1;
    let xHit: MutablePoint | undefined;
    let yHit: MutablePoint | undefined;
    if (line.xDirection !== 0) {
      const edgeX = line.xDirection > 0 ? left : right;
      const y = line.y1 + (edgeX - line.x1) * line.xGradient;
      if (y >= top && y <= bottom) xHit = { x: edgeX, y };
    }
    if (line.yDirection !== 0) {
      const edgeY = line.yDirection > 0 ? top : bottom;
      const x = line.x1 + (edgeY - line.y1) * line.yGradient;
      if (x >= left && x <= right) yHit = { x, y: edgeY };
    }
    if (xHit && yHit) {
      const nearer = line.distanceFromStartSquared(xHit.x, xHit.y) >= line.distanceFromStartSquared(yHit.x, yHit.y) ? yHit : xHit;
      return { kind: LineHitKind.Wall, poi: nearer };
    }
    const hit = xHit ?? yHit;
    return hit ? { kind: LineHitKind.Wall, poi: hit } : undefined;
  }
}

export function shortTurnSign(target: number, current: number): number {
  const far = Math.abs(target - current) > HALF_DIRECTION_RANGE;
  if (target > current) return far ? -1 : 1;
  return far ? 1 : -1;
}
