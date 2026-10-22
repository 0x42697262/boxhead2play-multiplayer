import { describe, expect, it } from 'vitest';
import { CollideFlag } from '../../../src/domain/map/CollideFlag.ts';
import { Angle } from '../../../src/domain/math/Angle.ts';
import { SequenceRng } from '../../../src/domain/math/Rng.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import {
  pickSpawnPoint,
  pickSpawnPointClose,
  pickSpawnPointFar,
  pickSpawnPointNonStrict,
  validateSpawnPoints,
  withinPlayerScope,
  type SpawnPoint,
} from '../../../src/domain/world/spawning.ts';
import { at, cellObject, makeWorld, room, solid } from '../support/fakes.ts';

function pointsAt(world: ReturnType<typeof makeWorld>['world'], cells: readonly (readonly [number, number])[]): SpawnPoint[] {
  return validateSpawnPoints(
    cells.map(([x, y]) => ({ position: at(x + 0.5, y + 0.5), cell: world.map.cell(x, y), angle: new Angle(0), nextCell: undefined })),
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
    expect(points[0]?.nextCell).toBe(world.map.cell(11, 10));
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
    world.map.cell(6, 3).collide |= CollideFlag.Creature;
    expect(pickSpawnPoint(points, new SequenceRng([0.5]))).toBe(points[2]);
    world.map.cell(10, 3).collide |= CollideFlag.Object;
    expect(pickSpawnPoint(points, new SequenceRng([0.5]))).toBe(points[0]);
  });

  it('lets devils spawn next to objects but not creatures', () => {
    const { world } = makeWorld(room(30, 20));
    const points = pointsAt(world, [[3, 3]]);
    world.map.cell(4, 3).collide |= CollideFlag.Object;
    expect(pickSpawnPoint(points, new SequenceRng([0]))).toBeUndefined();
    expect(pickSpawnPointNonStrict(points, new SequenceRng([0]))).toBe(points[0]);
    world.map.cell(3, 3).collide |= CollideFlag.Creature;
    expect(pickSpawnPointNonStrict(points, new SequenceRng([0]))).toBeUndefined();
  });

  it('picks the closest point at least two cells away for coop and the farthest in scope otherwise', () => {
    const { world } = makeWorld(room(60, 20));
    const points = pointsAt(world, [
      [5, 5],
      [6, 5],
      [12, 5],
      [20, 5],
      [40, 5],
    ]);
    const player = at(5.5, 5.5);
    expect(pickSpawnPointClose(points, new SequenceRng([0]), player)).toBe(points[2]);
    expect(pickSpawnPointFar(points, new SequenceRng([0]), player)).toBe(points[3]);
    expect(withinPlayerScope(player, at(24.5, 18.5))).toBe(true);
    expect(withinPlayerScope(player, at(25, 5.5))).toBe(false);
  });

  it('never respawns on a cell a player stands on', () => {
    const { world } = makeWorld(room(30, 20));
    const points = pointsAt(world, [
      [8, 5],
      [12, 5],
    ]);
    world.map.cell(12, 5).collide |= CollideFlag.Player;
    expect(pickSpawnPointFar(points, new SequenceRng([0]), at(5.5, 5.5))).toBe(points[0]);
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
