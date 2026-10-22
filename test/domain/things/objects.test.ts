import { describe, expect, it } from 'vitest';
import { DomainEventType } from '../../../src/domain/events.ts';
import { Angle } from '../../../src/domain/math/Angle.ts';
import { CollideFlag } from '../../../src/domain/map/CollideFlag.ts';
import { BulletAffect } from '../../../src/domain/things/affects/BulletAffect.ts';
import type { Barrel } from '../../../src/domain/things/objects/Barrel.ts';
import { Mine } from '../../../src/domain/things/objects/Mine.ts';
import { Pickup, PickupPhase } from '../../../src/domain/things/objects/Pickup.ts';
import type { Wall } from '../../../src/domain/things/objects/Wall.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { WeaponName } from '../../../src/domain/weapons/WeaponName.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { PlayerControl } from '../../../src/domain/world/input.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import type { World } from '../../../src/domain/world/World.ts';
import { at, cellObject, FakeThing, room } from '../support/fakes.ts';
import { held, tickInput } from '../support/input.ts';
import { makeRealWorld, ofClass, playerOf, run, spawn } from '../support/realWorld.ts';

const bullet = (world: World, damage: number) => new BulletAffect(undefined, new FakeThing(world, at(0.5, 0.5)), damage, new Angle(0));

describe('Barrel', () => {
  it('explodes when shot and sets off a neighbouring barrel the next tick', () => {
    const world = makeRealWorld(room(16, 10, [cellObject(InitKind.Player1, 1, 1), cellObject(InitKind.Barrel, 6, 5, 1), cellObject(InitKind.Barrel, 7, 5, 2)]));
    const barrels = ofClass(world, ThingClass.Barrel) as Barrel[];
    expect(barrels).toHaveLength(2);
    expect(world.map.cell(6, 5).collide & CollideFlag.Object).toBeTruthy();
    world.events.drain();
    barrels[1]?.affect(bullet(world, 1));
    run(world, 1);
    expect(ofClass(world, ThingClass.EffectExplosion)).toHaveLength(1);
    run(world, 1);
    const events = world.events.drain();
    expect(events.some((event) => event.type === DomainEventType.CameraShaken)).toBe(true);
    expect(events.some((event) => event.type === DomainEventType.DecalRequested && event.decal === 'scorchMark')).toBe(true);
    run(world, 1);
    expect(ofClass(world, ThingClass.EffectExplosion).length).toBeGreaterThanOrEqual(2);
    run(world, 1);
    expect(ofClass(world, ThingClass.Barrel)).toHaveLength(0);
    expect(world.map.cell(6, 5).collide & CollideFlag.Object).toBe(0);
  });
});

describe('Wall', () => {
  it('shows damage frames, then smokes, scorches and fades out', () => {
    const world = makeRealWorld(room(16, 10, [cellObject(InitKind.Player1, 1, 1), cellObject(InitKind.Wall, 6, 5, 1)]));
    const [wall] = ofClass(world, ThingClass.Wall) as Wall[];
    if (!wall) throw new Error('no wall');
    wall.affect(bullet(world, 500));
    run(world, 1);
    expect(wall.life).toBe(500);
    expect(wall.damageFrame).toBe(2);
    wall.affect(bullet(world, 600));
    run(world, 1);
    expect(ofClass(world, ThingClass.EffectSmokeCloud)).toHaveLength(1);
    expect(wall.alpha).toBe(80);
    run(world, 5);
    expect(ofClass(world, ThingClass.Wall)).toHaveLength(0);
    expect(world.map.cell(6, 5).collide & CollideFlag.Object).toBe(0);
  });
});

describe('Pickup', () => {
  it('gives the player a weapon refill or life and comes back after 30 s', () => {
    const world = makeRealWorld(room(16, 10, [cellObject(InitKind.Player1, 3, 3), cellObject(InitKind.Pickup, 5, 3, 1)]));
    const player = playerOf(world);
    player.newWeapon(WeaponName.Uzi);
    const uzi = player.inventory.slot(WeaponName.Uzi)?.weapon;
    if (!uzi) throw new Error('no uzi');
    uzi.ammo = 10;
    const [pickup] = ofClass(world, ThingClass.Pickup) as Pickup[];
    world.events.drain();
    run(world, 14, tickInput(held(PlayerControl.Right)));
    expect(pickup?.phase).toBe(PickupPhase.Reappearing);
    const events = world.events.drain();
    expect(events.some((event) => event.type === DomainEventType.HudMessage && event.text.key === 'hud.pickedUp.uzi')).toBe(true);
    expect(player.inventory.slot(WeaponName.Uzi)?.weapon?.ammo).toBe(100);
    expect(pickup?.cellId).toBeUndefined();
    run(world, 30 * 25 + 2, tickInput(held(PlayerControl.Left)));
    expect(pickup?.phase).toBe(PickupPhase.Waiting);
  });

  it('drops expire after their lifetime and fade in the last second', () => {
    const world = makeRealWorld(room(16, 10, [cellObject(InitKind.Player1, 1, 1)]));
    const dropped = spawn(world, Pickup.dropped(world, at(8.2, 5.7), 250));
    expect(dropped.position).toEqual(at(8.5, 5.5));
    run(world, 240);
    expect(dropped.alpha).toBeLessThan(100);
    run(world, 13);
    expect(ofClass(world, ThingClass.Pickup)).toHaveLength(0);
  });
});

describe('Mine in deathmatch', () => {
  it('waits for its owner to leave the cell before arming against players', () => {
    const world = makeRealWorld(room(16, 10, [cellObject(InitKind.Player1, 3, 3), cellObject(InitKind.Player2, 12, 7, 1)]), {
      options: { gameMode: GameMode.DeathMatch },
    });
    const player = playerOf(world);
    const mine = spawn(world, new Mine(world, at(3.5, 3.5), new Angle(0), player));
    run(world, 5);
    expect(mine.phase).toBe('arming');
    run(world, 10, tickInput(held(PlayerControl.Down)));
    expect(mine.phase).toBe('armed');
  });
});
