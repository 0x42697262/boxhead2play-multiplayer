import type { Angle } from '../math/Angle.ts';
import { DIRECTION_COUNT, STRAIGHT_DIRECTION_STEP } from '../math/Direction.ts';
import type { Position } from '../math/Position.ts';
import type { Rng } from '../math/Rng.ts';
import { CollideFlag, CollideMask } from '../map/CollideFlag.ts';
import type { MapCell } from '../map/MapCell.ts';
import { PLAYER_SCOPE_CELLS_X, PLAYER_SCOPE_CELLS_Y, SPAWN_MIN_DISTANCE_SQUARED } from './tuning.ts';

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

export function pickSpawnPoint(points: readonly SpawnPoint[], rng: Rng): SpawnPoint | undefined {
  return scanFromRandom(points, rng, (point) => !(spawnCollide(point) & CollideMask.NoSpawn));
}

export function pickSpawnPointNonStrict(points: readonly SpawnPoint[], rng: Rng): SpawnPoint | undefined {
  return scanFromRandom(points, rng, (point) => !(spawnCollide(point) & CollideFlag.Creature));
}

export function withinPlayerScope(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) <= PLAYER_SCOPE_CELLS_X && Math.abs(a.y - b.y) <= PLAYER_SCOPE_CELLS_Y;
}

const PLAYER_SPAWN_BLOCK = CollideMask.NoSpawn | CollideFlag.Player;

function pickByDistance(
  points: readonly SpawnPoint[],
  rng: Rng,
  from: Position,
  better: (distance: number, best: number) => boolean,
  initial: number,
): SpawnPoint | undefined {
  let best: SpawnPoint | undefined;
  let bestDistance = initial;
  scanFromRandom(points, rng, (point) => {
    if (point.cell.collide & PLAYER_SPAWN_BLOCK) return false;
    const distance = point.position.distanceSquared(from);
    if (better(distance, bestDistance) && withinPlayerScope(from, point.position)) {
      bestDistance = distance;
      best = point;
    }
    return false;
  });
  return best;
}

export function pickSpawnPointClose(points: readonly SpawnPoint[], rng: Rng, from: Position): SpawnPoint | undefined {
  return pickByDistance(points, rng, from, (d, best) => d < best && d >= SPAWN_MIN_DISTANCE_SQUARED, Number.MAX_VALUE);
}

export function pickSpawnPointFar(points: readonly SpawnPoint[], rng: Rng, from: Position): SpawnPoint | undefined {
  return pickByDistance(points, rng, from, (d, best) => d >= best, 0);
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
      if (seen.has(next) || next.collide & CollideMask.StaticImpassable) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return undefined;
}
