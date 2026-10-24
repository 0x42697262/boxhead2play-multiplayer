import { describe, expect, it } from 'vitest';
import { CollideFlag } from '../../../src/domain/map/CollideFlag.ts';
import { Angle } from '../../../src/domain/math/Angle.ts';
import { SequenceRng } from '../../../src/domain/math/Rng.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import {
  pickPlayerSpawnCell,
  pickSpawnPoint,
  pickSpawnPointNonStrict,
  playerSpawnFloor,
  reachableFloor,
  validateSpawnPoints,
  type SpawnPoint,
} from '../../../src/domain/world/spawning.ts';
import { at, cellObject, makeWorld, room, solid, cellOf } from '../support/fakes.ts';

function pointsAt(world: ReturnType<typeof makeWorld>['world'], cells: readonly (readonly [number, number])[]): SpawnPoint[] {
  return validateSpawnPoints(
    cells.map(([x, y]) => ({ position: at(x + 0.5, y + 0.5), cell: cellOf(world, x, y), angle: new Angle(0), nextCell: undefined })),
  );
}

describe('spawn point validation', () => {
  it('drops points without a straight neighbour free of static collision', () => {
    const { world } = makeWorld(room(30, 20, [solid(5, 4, 3, 1), solid(5, 6, 3, 1), solid(5, 5, 1, 1), solid(7, 5, 1, 1)]));
    const points = pointsAt(world, [
      [6, 5],
      [10, 10],
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]?.nextCell).toBe(cellOf(world, 11, 10));
  });
});

describe('spawn point selection', () => {
  it('scans from a random start index and skips points blocked by creatures or objects', () => {
    const { world } = makeWorld(room(30, 20));
    const points = pointsAt(world, [
      [3, 3],
      [6, 3],
      [9, 3],
    ]);
    expect(pickSpawnPoint(points, new SequenceRng([0.5]))).toBe(points[1]);
    cellOf(world, 6, 3).collide |= CollideFlag.Creature;
    expect(pickSpawnPoint(points, new SequenceRng([0.5]))).toBe(points[2]);
    cellOf(world, 10, 3).collide |= CollideFlag.Object;
    expect(pickSpawnPoint(points, new SequenceRng([0.5]))).toBe(points[0]);
  });

  it('lets devils spawn next to objects but not creatures', () => {
    const { world } = makeWorld(room(30, 20));
    const points = pointsAt(world, [[3, 3]]);
    cellOf(world, 4, 3).collide |= CollideFlag.Object;
    expect(pickSpawnPoint(points, new SequenceRng([0]))).toBeUndefined();
    expect(pickSpawnPointNonStrict(points, new SequenceRng([0]))).toBe(points[0]);
    cellOf(world, 3, 3).collide |= CollideFlag.Creature;
    expect(pickSpawnPointNonStrict(points, new SequenceRng([0]))).toBeUndefined();
  });

  it('collects the floor reachable from the markers, without walls or closed-off cells', () => {
    const { world } = makeWorld(room(12, 8, [solid(6, 0, 1, 8), solid(2, 2, 1, 1)]));
    const floor = reachableFloor([cellOf(world, 1, 1)]);
    expect(floor).toContain(cellOf(world, 5, 6));
    expect(floor).not.toContain(cellOf(world, 2, 2));
    expect(floor).not.toContain(cellOf(world, 6, 3));
    expect(floor).not.toContain(cellOf(world, 8, 3));
  });

  it('keeps the floor cells at least the door clearance away from every door', () => {
    const { world } = makeWorld(room(30, 20));
    const floor = [cellOf(world, 3, 3), cellOf(world, 6, 3), cellOf(world, 9, 3)];
    const spawnFloor = playerSpawnFloor(floor, [{ x: 1, y: 3 }], 5);
    expect(spawnFloor.awayFromDoors).toEqual([floor[1], floor[2]]);
    expect(spawnFloor.all).toBe(floor);
  });

  it('picks the drawn candidate furthest from the nearest enemy, the first drawn on a tie', () => {
    const { world } = makeWorld(room(30, 20));
    const floor = [cellOf(world, 3, 3), cellOf(world, 6, 3), cellOf(world, 9, 3), cellOf(world, 12, 3)];
    const search = (draws: number[], enemies: { x: number; y: number }[]) =>
      pickPlayerSpawnCell({ floor: { awayFromDoors: floor, all: floor }, rng: new SequenceRng(draws), enemies, candidates: draws.length });
    expect(search([0, 0.3, 0.6], [{ x: 2, y: 3 }])).toBe(floor[2]);
    expect(search([0, 0.3, 0.6], [{ x: 2, y: 3 }, { x: 10, y: 3 }])).toBe(floor[1]);
    expect(search([0.6, 0.3], [])).toBe(floor[2]);
    expect(search([0.3, 0.6], [{ x: 7, y: 9 }])).toBe(floor[1]);
  });

  it('never picks a player or creature cell and falls back to all free cells near doors', () => {
    const { world } = makeWorld(room(30, 20));
    const all = [cellOf(world, 3, 3), cellOf(world, 6, 3), cellOf(world, 9, 3)];
    const awayFromDoors = [cellOf(world, 6, 3), cellOf(world, 9, 3)];
    cellOf(world, 6, 3).collide |= CollideFlag.Player;
    cellOf(world, 9, 3).collide |= CollideFlag.Creature;
    expect(pickPlayerSpawnCell({ floor: { awayFromDoors, all }, rng: new SequenceRng([0.9]), enemies: [], candidates: 4 })).toBe(all[0]);
    cellOf(world, 3, 3).collide |= CollideFlag.Object;
    expect(pickPlayerSpawnCell({ floor: { awayFromDoors, all }, rng: new SequenceRng([0.9]), enemies: [], candidates: 4 })).toBeUndefined();
  });
});

describe('World spawning', () => {
  it('spawns zombies at a valid point and counts them for the level', () => {
    const { world } = makeWorld(room(20, 12, [cellObject(InitKind.Player1, 2, 2), cellObject(InitKind.Zombie, 15, 8)]), { start: false });
    expect(world.spawnZombie()).toBe(true);
    expect(world.things.count(ThingClass.Zombie)).toBe(1);
    expect(world.upgrades.level.liveZombies).toBe(1);
    const zombie = world.things.newestFirst()[0];
    expect(zombie?.position).toEqual(at(15.5, 8.5));
  });

  it('spawns devils only from devil points', () => {
    const { world } = makeWorld(room(20, 12, [cellObject(InitKind.Zombie, 15, 8)]), { start: false });
    expect(world.spawnDevil()).toBe(false);
  });
});
