import { describe, expect, it } from 'vitest';
import { DomainEventType, type DomainEvent } from '../../../src/domain/events.ts';
import { CollideFlag } from '../../../src/domain/map/CollideFlag.ts';
import { Zombie } from '../../../src/domain/things/creatures/Zombie.ts';
import type { Player } from '../../../src/domain/things/creatures/Player.ts';
import type { Explosion } from '../../../src/domain/things/effects/Explosion.ts';
import type { Barrel } from '../../../src/domain/things/objects/Barrel.ts';
import type { ChargePack } from '../../../src/domain/things/objects/ChargePack.ts';
import { PlacementPhase } from '../../../src/domain/things/objects/PlacementPhase.ts';
import { Bullet } from '../../../src/domain/things/shots/Bullet.ts';
import type { GrenadeShot } from '../../../src/domain/things/shots/GrenadeShot.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { ThingFlag } from '../../../src/domain/things/ThingFlag.ts';
import { ChargePackWeapon } from '../../../src/domain/things/weapons/explosives.ts';
import { INFINITE_AMMO, WeaponName } from '../../../src/domain/weapons/WeaponName.ts';
import { PlayerControl, type PlayerInput } from '../../../src/domain/world/input.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import type { World } from '../../../src/domain/world/World.ts';
import { at, cellObject, room } from '../support/fakes.ts';
import { held, tickInput } from '../support/input.ts';
import { makeRealWorld, ofClass, playerOf, run, runUntil, spawn } from '../support/realWorld.ts';

const SELECT_KEY: Readonly<Record<WeaponName, PlayerControl>> = {
  pistol: PlayerControl.Select1,
  uzi: PlayerControl.Select2,
  shotgun: PlayerControl.Select3,
  barrel: PlayerControl.Select4,
  grenade: PlayerControl.Select5,
  fakewall: PlayerControl.Select6,
  mine: PlayerControl.Select7,
  rocket: PlayerControl.Select8,
  chargepack: PlayerControl.Select9,
  railgun: PlayerControl.Select0,
};

function range(): World {
  return makeRealWorld(room(16, 8, [cellObject(InitKind.Player1, 2, 3)]));
}

function armed(world: World, weapon: WeaponName): Player {
  const player = playerOf(world);
  player.newWeapon(weapon);
  run(world, 1, tickInput(held(SELECT_KEY[weapon])));
  run(world, 1);
  expect(player.inventory.currentName).toBe(weapon);
  return player;
}

function step(world: World, input: PlayerInput = held()): DomainEvent[] {
  world.update(tickInput(input));
  return world.events.drain();
}

function sounds(events: readonly DomainEvent[]): string[] {
  return events.flatMap((event) => (event.type === DomainEventType.SoundRequested ? [event.sound] : []));
}

function readyZombie(world: World, x: number): Zombie {
  const zombie = spawn(world, new Zombie(world, at(x, 3.5)));
  run(world, 2);
  return zombie;
}

describe('firearms', () => {
  it('pistol: one bullet and muzzle flash per press, 8 tick fire rate, 26 damage, infinite ammo', () => {
    const world = range();
    const player = playerOf(world);
    const zombie = readyZombie(world, 8.5);
    world.events.drain();
    const fired = step(world, held(PlayerControl.Fire));
    expect(sounds(fired)).toContain('pistolFire');
    expect(ofClass(world, ThingClass.ShotBullet)).toHaveLength(1);
    expect(ofClass(world, ThingClass.EffectMuzzleFlash)).toHaveLength(1);
    step(world, held(PlayerControl.Fire));
    expect(zombie.life).toBe(100 - 26);
    for (let tick = 0; tick < 4; tick++) step(world, held(PlayerControl.Fire));
    step(world);
    step(world, held(PlayerControl.Fire));
    expect(player.inventory.current?.ammo).toBe(INFINITE_AMMO);
    expect(world.things.newestFirst().filter((thing) => thing instanceof Bullet)).toHaveLength(0);
  });

  it('uzi: automatic fire every 4 ticks while held, 100 rounds', () => {
    const world = range();
    const player = armed(world, WeaponName.Uzi);
    run(world, 20, tickInput(held(PlayerControl.Fire)));
    expect(player.inventory.current?.ammo).toBe(95);
  });

  it('shotgun: three pellets, five with wide shot where the outer pair waits a tick', () => {
    const world = range();
    const player = armed(world, WeaponName.Shotgun);
    step(world, held(PlayerControl.Fire));
    expect(ofClass(world, ThingClass.ShotBullet)).toHaveLength(3);
    expect(player.inventory.current?.ammo).toBe(19);
    run(world, 14);
    const shotgun = player.inventory.current;
    if (!shotgun) throw new Error('no shotgun');
    shotgun.wideShot = 1;
    step(world, held(PlayerControl.Fire));
    const pellets = ofClass(world, ThingClass.ShotBullet) as Bullet[];
    expect(pellets).toHaveLength(5);
    step(world, held(PlayerControl.Fire));
    expect(pellets.filter((pellet) => pellet.hasFired)).toHaveLength(3);
  });

  it('railgun: one shot pierces every zombie on the line', () => {
    const world = range();
    armed(world, WeaponName.Railgun);
    const near = readyZombie(world, 6.5);
    const far = readyZombie(world, 9.5);
    step(world, held(PlayerControl.Fire));
    step(world);
    step(world);
    expect(near.life).toBeLessThanOrEqual(0);
    expect(far.life).toBeLessThanOrEqual(0);
  });

  it('runs out of ammo, warns and falls back to the pistol', () => {
    const world = range();
    const player = armed(world, WeaponName.Uzi);
    const uzi = player.inventory.current;
    if (!uzi) throw new Error('no uzi');
    uzi.ammo = 0;
    const events = step(world);
    expect(events.some((event) => event.type === DomainEventType.HudMessage && event.text.key === 'hud.outOfAmmo.uzi')).toBe(true);
    expect(player.inventory.currentName).toBe(WeaponName.Pistol);
  });
});

describe('explosives', () => {
  it('rocket: flies until it hits and explodes for 250 in a 2.75 cell range', () => {
    const world = range();
    armed(world, WeaponName.Rocket);
    step(world, held(PlayerControl.Fire));
    expect(ofClass(world, ThingClass.ShotRocket)).toHaveLength(1);
    runUntil(world, () => ofClass(world, ThingClass.EffectExplosion).length > 0, 100);
    const [explosion] = ofClass(world, ThingClass.EffectExplosion) as Explosion[];
    expect(explosion?.damage).toBe(250);
    expect(explosion?.range).toBeCloseTo(2.75);
    expect(explosion?.parent).toBe(playerOf(world));
    step(world);
    expect(ofClass(world, ThingClass.ShotRocket)).toHaveLength(0);
  });

  it('grenade: thrown on release with power from the hold time, explodes after 60 ticks', () => {
    const world = range();
    const player = armed(world, WeaponName.Grenade);
    run(world, 10, tickInput(held(PlayerControl.Fire)));
    step(world);
    const [grenade] = ofClass(world, ThingClass.ShotGrenade) as GrenadeShot[];
    expect(grenade?.power).toBeCloseTo(10 / 25);
    expect(player.inventory.current?.ammo).toBe(19);
    run(world, 59);
    expect(ofClass(world, ThingClass.EffectExplosion)).toHaveLength(0);
    run(world, 2);
    expect(ofClass(world, ThingClass.EffectExplosion)).toHaveLength(1);
  });

  it('mine: placed on a free cell, detonates 2 s after a creature steps on it', () => {
    const world = range();
    armed(world, WeaponName.Mine);
    const events = step(world, held(PlayerControl.Fire));
    expect(sounds(events)).toContain('minePlace');
    const [mine] = ofClass(world, ThingClass.Mine);
    expect(mine?.position).toEqual(at(2.5, 3.5));
    expect(mine?.hasFlag(ThingFlag.SortFloor)).toBe(true);
    run(world, 3);
    world.map.cell(2, 3).collide |= CollideFlag.Creature;
    const detonate = step(world);
    expect(sounds(detonate)).toContain('mineDetonate');
    run(world, 49);
    expect(ofClass(world, ThingClass.EffectExplosion)).toHaveLength(0);
    run(world, 1);
    expect(ofClass(world, ThingClass.EffectExplosion)).toHaveLength(1);
  });

  it('barrel: placed under the player, becomes solid once the player steps off', () => {
    const world = range();
    armed(world, WeaponName.Barrel);
    step(world, held(PlayerControl.Fire));
    const [barrel] = ofClass(world, ThingClass.Barrel) as Barrel[];
    run(world, 1);
    expect(barrel?.phase).toBe(PlacementPhase.PlayerOnCell);
    expect(barrel?.hasFlag(ThingFlag.Collidable)).toBe(false);
    run(world, 12, tickInput(held(PlayerControl.Up)));
    run(world, 12);
    expect(barrel?.phase).toBe(PlacementPhase.Normal);
    expect(barrel?.radius).toBe(0.42);
    expect(barrel?.damage).toBe(150);
  });

  it('fake wall: placed for the player and marks the cell as an object', () => {
    const world = range();
    const player = armed(world, WeaponName.FakeWall);
    step(world, held(PlayerControl.Fire));
    run(world, 1);
    const [wall] = ofClass(world, ThingClass.Wall);
    expect(wall?.parent).toBe(player);
    expect(world.map.cell(2, 3).collide & CollideFlag.Object).toBeTruthy();
    expect(player.inventory.current?.ammo).toBe(4);
  });

  it('charge pack: the first press places a pack, the next press detonates all packs of that player', () => {
    const world = range();
    const player = armed(world, WeaponName.ChargePack);
    step(world, held(PlayerControl.Fire));
    step(world);
    const weapon = player.inventory.current;
    if (!(weapon instanceof ChargePackWeapon)) throw new Error('no charge pack weapon');
    expect(weapon.detonate).toBe(true);
    expect(weapon.placedPacks()).toHaveLength(1);
    step(world, held(PlayerControl.Fire));
    const [pack] = ofClass(world, ThingClass.ChargePack) as ChargePack[];
    expect(pack?.detonateRequested).toBe(true);
    run(world, 5);
    expect(ofClass(world, ThingClass.EffectExplosion)).toHaveLength(1);
  });
});

describe('upgrades', () => {
  it('unlocks weapons and stats through the multiplier', () => {
    const world = range();
    const player = playerOf(world);
    world.upgrades.logKills(4);
    expect(world.upgrades.multiplier).toBe(5);
    expect(player.inventory.slot(WeaponName.Uzi)?.active).toBe(true);
    expect(player.inventory.slot(WeaponName.Shotgun)?.active).toBe(false);
    step(world);
    expect(player.inventory.current?.auto).toBe(true);
  });

  it('doubles uzi ammo and refills it when the upgrade lands', () => {
    const world = range();
    world.upgrades.logKills(16);
    const player = armed(world, WeaponName.Uzi);
    expect(player.inventory.current?.totalAmmo).toBe(200);
  });
});
