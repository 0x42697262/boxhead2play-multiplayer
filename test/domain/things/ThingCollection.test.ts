import { describe, expect, it } from 'vitest';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { ThingFlag } from '../../../src/domain/things/ThingFlag.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import type { FakePlayer} from '../support/fakes.ts';
import { FakeThing, at, cellObject, makeWorld, place, room } from '../support/fakes.ts';

class RecordingThing extends FakeThing {
  constructor(
    world: ConstructorParameters<typeof FakeThing>[0],
    private readonly log: number[],
  ) {
    super(world, at(4.5, 4.5));
  }

  override process(): void {
    this.log.push(this.uniqueId);
  }
}

describe('Thing', () => {
  it('allocates unique ids per world and inherits the parent id', () => {
    const { world } = makeWorld(room(10, 10));
    const parent = new FakeThing(world, at(1, 1));
    const child = new FakeThing(world, at(1, 1), ThingClass.ShotBullet, { parent });
    expect(child.uniqueId).toBe(parent.uniqueId + 1);
    expect(child.id).toBe(parent.id);
    child.makeIdUnique();
    expect(child.id).toBe(child.uniqueId);
    expect(child.key).toBe(`t${child.uniqueId}`);
  });

  it('grows its radius in 0.05 steps up to a target', () => {
    const { world } = makeWorld(room(10, 10));
    const wall = new FakeThing(world, at(1, 1));
    expect(wall.growRadius(0.1)).toBe(true);
    expect(wall.radius).toBeCloseTo(0.05);
    wall.setRadius(0.5);
    expect(wall.growRadius(0.48)).toBe(false);
    expect(wall.radiusSquared).toBeCloseTo(0.25);
  });
});

describe('ThingCollection', () => {
  it('processes things newest first and skips things added during the pass', () => {
    const { world } = makeWorld(room(10, 10));
    const log: number[] = [];
    const a = world.things.add(new RecordingThing(world, log));
    const b = world.things.add(new RecordingThing(world, log));
    world.things.process();
    expect(log).toEqual([b.uniqueId, a.uniqueId]);
  });

  it('defers deletion to the next pass but updates counters at once', () => {
    const { world } = makeWorld(room(10, 10));
    const zombie = place(world, new FakeThing(world, at(4.5, 4.5), ThingClass.Zombie));
    expect(world.things.count(ThingClass.Zombie)).toBe(1);
    zombie.delete();
    expect(world.things.count(ThingClass.Zombie)).toBe(0);
    expect(world.things.newestFirst()).toContain(zombie);
    expect(zombie.isProcessing).toBe(false);
    world.things.process();
    expect(world.things.newestFirst()).not.toContain(zombie);
    expect(world.map.cell(4, 4).childCount).toBe(0);
  });

  it('returns the only player regardless of distance, otherwise the closest living one', () => {
    const { world } = makeWorld(room(20, 10, [cellObject(InitKind.Player1, 2, 2), cellObject(InitKind.Player2, 8, 2)]), {
      options: { gameMode: GameMode.Coop },
    });
    const [second, first] = world.things.players() as FakePlayer[];
    expect(first?.playerIndex).toBe(0);
    expect(world.things.closestPlayer(at(9, 2))).toBe(second);
    if (second) second.flags |= ThingFlag.Dead;
    expect(world.things.closestPlayer(at(9, 2))).toBe(first);
    expect(world.things.otherPlayer(first)).toBe(second);
  });
});
