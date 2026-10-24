import type { Angle } from '../math/Angle.ts';
import { DIRECTION_COUNT, STRAIGHT_DIRECTION_STEP } from '../math/Direction.ts';
import type { Position } from '../math/Position.ts';
import type { Rng } from '../math/Rng.ts';
import { CollideFlag, CollideMask } from '../map/CollideFlag.ts';
import type { MapCell } from '../map/MapCell.ts';

export interface SpawnPoint {
  readonly position: Position;
  readonly cell: MapCell;
  readonly angle: Angle;
  nextCell: MapCell | undefined;
}

export function validateSpawnPoints(points: readonly SpawnPoint[]): SpawnPoint[] {
  const valid: SpawnPoint[] = [];
  for (const point of points) {
    point.nextCell = point.cell.validMoveNeighbour();
    if (point.nextCell) valid.push(point);
  }
  return valid;
}

function scanFromRandom(points: readonly SpawnPoint[], rng: Rng, accept: (point: SpawnPoint) => boolean): SpawnPoint | undefined {
  let index = rng.int(points.length);
  for (let remaining = points.length; remaining > 0; remaining--) {
    const point = points[index];
    if (point && accept(point)) return point;
    index = (index + 1) % points.length;
  }
  return undefined;
}

function spawnCollide(point: SpawnPoint): number {
  return point.cell.collide | (point.nextCell?.collide ?? CollideFlag.None);
}

export function standablePlayerPoints(points: readonly SpawnPoint[]): SpawnPoint[] {
  return points.filter((point) => !(point.cell.collide & CollideMask.StaticImpassable));
}

export function pickSpawnPoint(points: readonly SpawnPoint[], rng: Rng): SpawnPoint | undefined {
  return scanFromRandom(points, rng, (point) => !(spawnCollide(point) & CollideMask.NoSpawn));
}

export function pickSpawnPointNonStrict(points: readonly SpawnPoint[], rng: Rng): SpawnPoint | undefined {
  return scanFromRandom(points, rng, (point) => !(spawnCollide(point) & CollideFlag.Creature));
}

export function reachableFloor(starts: readonly MapCell[]): MapCell[] {
  const seen = new Set<MapCell>(starts);
  const floor: MapCell[] = [...seen];
  for (let index = 0; index < floor.length; index++) {
    const cell = floor[index];
    if (!cell) break;
    for (let direction = 0; direction < DIRECTION_COUNT; direction += STRAIGHT_DIRECTION_STEP) {
      const next = cell.adjacent(direction);
      if (seen.has(next) || next.collide & (CollideMask.StaticImpassable | CollideFlag.EdgeOfMap)) continue;
      seen.add(next);
      floor.push(next);
    }
  }
  return floor;
}

export function pickPlayerSpawnCell(floor: readonly MapCell[], rng: Rng, clear: (cell: MapCell) => boolean): MapCell | undefined {
  const free = floor.filter((cell) => !(cell.collide & CollideMask.NonMovablePlayer));
  const cleared = free.filter(clear);
  const pool = cleared.length > 0 ? cleared : free;
  return pool.length > 0 ? pool[rng.int(pool.length)] : undefined;
}

export function openSpawnNear(origin: SpawnPoint, occupied: ReadonlySet<MapCell>, searchCells: number): SpawnPoint | undefined {
  const seen = new Set<MapCell>([origin.cell]);
  const queue: MapCell[] = [origin.cell];
  for (let index = 0; index < queue.length && index < searchCells; index++) {
    const cell = queue[index];
    if (!cell) break;
    if (!(cell.collide & CollideMask.NonMovablePlayer) && !occupied.has(cell)) {
      return { position: cell.centre.clone(), cell, angle: origin.angle.clone(), nextCell: cell.validMoveNeighbour() };
    }
    for (let direction = 0; direction < DIRECTION_COUNT; direction += STRAIGHT_DIRECTION_STEP) {
      const next = cell.adjacent(direction);
      if (seen.has(next) || next.collide & CollideFlag.EdgeOfMap) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return undefined;
}
