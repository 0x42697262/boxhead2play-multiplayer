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

export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

export interface PlayerSpawnFloor {
  readonly awayFromDoors: readonly MapCell[];
  readonly all: readonly MapCell[];
}

export interface PlayerSpawnSearch {
  readonly floor: PlayerSpawnFloor;
  readonly rng: Rng;
  readonly threats: readonly CellPoint[];
  readonly clearances: readonly number[];
  readonly recent: ReadonlySet<MapCell>;
}

export function cellDistance(first: CellPoint, second: CellPoint): number {
  return Math.max(Math.abs(first.x - second.x), Math.abs(first.y - second.y));
}

export function playerSpawnFloor(floor: readonly MapCell[], doors: readonly CellPoint[], doorClearanceCells: number): PlayerSpawnFloor {
  const awayFromDoors = floor.filter((cell) => doors.every((door) => cellDistance(door, cell) >= doorClearanceCells));
  return { awayFromDoors, all: floor };
}

function freeCells(cells: readonly MapCell[]): MapCell[] {
  return cells.filter((cell) => !(cell.collide & CollideMask.NonMovablePlayer));
}

function clearOf(threats: readonly CellPoint[], clearance: number): (cell: MapCell) => boolean {
  return (cell) => threats.every((threat) => cellDistance(threat, cell) >= clearance);
}

function pickAny(cells: readonly MapCell[], rng: Rng): MapCell | undefined {
  return cells.length > 0 ? cells[rng.int(cells.length)] : undefined;
}

export function pickPlayerSpawnCell(search: PlayerSpawnSearch): MapCell | undefined {
  const awayFromDoors = freeCells(search.floor.awayFromDoors);
  const pool = awayFromDoors.length > 0 ? awayFromDoors : freeCells(search.floor.all);
  const fresh = pool.filter((cell) => !search.recent.has(cell));
  for (const clearance of search.clearances) {
    const safe = clearOf(search.threats, clearance);
    const cell = pickAny(fresh.filter(safe), search.rng) ?? pickAny(pool.filter(safe), search.rng);
    if (cell) return cell;
  }
  return pickAny(fresh, search.rng) ?? pickAny(pool, search.rng);
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
