import { describe, expect, it } from 'vitest';
import { Angle } from '../../../src/domain/math/Angle.ts';
import { Devil } from '../../../src/domain/things/creatures/Devil.ts';
import { Player } from '../../../src/domain/things/creatures/Player.ts';
import { Zombie } from '../../../src/domain/things/creatures/Zombie.ts';
import { createThingFactory } from '../../../src/domain/things/factory.ts';
import { Barrel } from '../../../src/domain/things/objects/Barrel.ts';
import { Pickup, PickupPhase } from '../../../src/domain/things/objects/Pickup.ts';
import { Wall } from '../../../src/domain/things/objects/Wall.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { at, cellObject, room } from '../support/fakes.ts';
import { makeRealWorld } from '../support/realWorld.ts';

describe('createThingFactory', () => {
  it('builds the ported classes', () => {
    const world = makeRealWorld(room(10, 10, [cellObject(InitKind.Player1, 1, 1)]));
    const factory = createThingFactory();
    expect(factory.barrel(world, at(3.5, 3.5))).toBeInstanceOf(Barrel);
    expect(factory.wall(world, at(3.5, 3.5))).toBeInstanceOf(Wall);
    expect(factory.pickup(world, at(3.2, 3.9)).position).toEqual(at(3.5, 3.5));
    const dropped = factory.droppedPickup(world, at(4.5, 4.5), 250);
    expect(dropped).toBeInstanceOf(Pickup);
    expect((dropped as Pickup).phase).toBe(PickupPhase.DroppedInit);
    expect((dropped as Pickup).deleteOnPickup).toBe(true);
    expect(factory.zombie(world, at(5.5, 5.5))).toBeInstanceOf(Zombie);
    expect(factory.devil(world, at(5.5, 5.5))).toBeInstanceOf(Devil);
    const player = factory.player(world, at(6.5, 6.5), 1, new Angle(0));
    expect(player).toBeInstanceOf(Player);
    expect(player.playerIndex).toBe(1);
  });
});
