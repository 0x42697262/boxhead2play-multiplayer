import { describe, expect, it } from 'vitest';
import { DomainEventType } from '../../../src/domain/events.ts';
import { SoundId } from '../../../src/domain/sounds.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import type { UpgradableCreature, UpgradableWeapon } from '../../../src/domain/upgrades/contracts.ts';
import { buildLevels } from '../../../src/domain/upgrades/tables.ts';
import { WeaponName } from '../../../src/domain/weapons/WeaponName.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { Difficulty, GameSpeed } from '../../../src/domain/world/SimulationSettings.ts';
import { cellObject, makeWorld, room, type FakePlayer } from '../support/fakes.ts';

const playerRoom = () => room(20, 12, [cellObject(InitKind.Player1, 2, 2), cellObject(InitKind.Player2, 6, 2)]);

function uzi(): UpgradableWeapon {
  return {
    classId: ThingClass.WeaponUzi,
    auto: false,
    fireRate: 4,
    ammo: 100,
    totalAmmo: 100,
    damage: 20,
    wideShot: 0,
    biggerBang: 0,
    range: 8,
    fireRateCount: 3,
    clusterExplode: 0,
    homingMissiles: false,
    upgradeStamp: undefined,
  };
}

describe('level table', () => {
  it('starts at 10 zombies spawning every second and grows by five per level up to 60', () => {
    const levels = buildLevels(25, true);
    expect(levels).toHaveLength(100);
    expect(levels[0]).toMatchObject({ zombieSpawnRate: 25, zombieCount: 10, zombieTotalCount: 10, zombieSpeedUp: 1.1 });
    expect(levels[1]).toMatchObject({ zombieSpawnRate: 24, zombieCount: 15, zombieTotalCount: 15 });
    expect(levels[10]?.zombieCount).toBe(60);
    expect(levels[30]?.zombieSpawnRate).toBe(1);
    expect(levels[99]?.zombieSpeedUp).toBe(5);
  });

  it('adds devils from level 2, at most five, spawning no faster than once a second', () => {
    const levels = buildLevels(25, true);
    expect(levels[0]?.devil).toEqual({ spawnRate: 250, count: 0, totalCount: 0, speedUp: 1.1 });
    expect(levels[1]?.devil).toMatchObject({ spawnRate: 249, count: 1, totalCount: 1 });
    expect(levels[5]?.devil).toMatchObject({ count: 2, totalCount: 2 });
    expect(levels[99]?.devil).toMatchObject({ spawnRate: 151, count: 5 });
    expect(buildLevels(25, false)[1]?.devil).toBeUndefined();
  });
});

describe('Upgrades', () => {
  it('builds level tables and timers at the loading tick rate, then plays at the chosen speed', () => {
    const { world } = makeWorld(playerRoom(), { options: { gameSpeed: GameSpeed.Fast } });
    expect(world.upgrades.level.zombieSpawnRate).toBe(25);
    expect(world.ticksPerSecond).toBe(50);
  });

  it('advances the level once the quota is used up and no enemies remain', () => {
    const { world } = makeWorld(playerRoom());
    world.events.drain();
    world.upgrades.level.zombieCount = 0;
    world.upgrades.level.devilCount = 0;
    world.update();
    expect(world.upgrades.levelNumber).toBe(2);
    const events = world.events.drain();
    expect(events).toContainEqual({ type: DomainEventType.SoundRequested, sound: SoundId.Click });
    expect(events).toContainEqual(
      expect.objectContaining({ type: DomainEventType.HudMessage, text: { key: 'hud.level', params: { level: 2 } } }),
    );
  });

  it('starts expert games at level 20 with multiplier 30, silently unlocking earlier weapons', () => {
    const { world } = makeWorld(playerRoom(), { options: { difficulty: Difficulty.Expert, gameMode: GameMode.Coop } });
    expect(world.upgrades.levelNumber).toBe(20);
    expect(world.upgrades.multiplier).toBe(30);
    expect(world.events.drain().some((event) => event.type === DomainEventType.HudMessage)).toBe(false);
    for (const player of world.things.players() as FakePlayer[]) {
      expect(player.unlocked).toEqual([WeaponName.Uzi, WeaponName.Shotgun, WeaponName.Barrel, WeaponName.Grenade, WeaponName.FakeWall]);
    }
  });

  it('gives deathmatch every upgrade and freezes the spawner', () => {
    const { world } = makeWorld(playerRoom(), { options: { gameMode: GameMode.DeathMatch } });
    expect(world.upgrades.multiplier).toBe(200);
    const [player] = world.things.players() as FakePlayer[];
    expect(player?.unlocked).toHaveLength(9);
    expect(player?.resets).toBe(1);
    world.update();
    expect(world.upgrades.tick).toBe(0);
  });

  it('turns each kill into a multiple kill and a multiplier step, and lets the multiplier decay', () => {
    const { world } = makeWorld(playerRoom());
    world.upgrades.zombieSpawned();
    world.upgrades.zombieKilled();
    expect(world.upgrades.multiplier).toBe(2);
    expect(world.upgrades.multipleKill).toBe(1);
    expect(world.upgrades.level.zombieTotalCount).toBe(9);
    expect(world.upgrades.level.zombieCount).toBe(9);
    const ticks = world.upgrades.multiplierTicks(2);
    expect(ticks).toBeCloseTo(73.21, 1);
    for (let i = 0; i < Math.ceil(ticks) + 1; i++) world.update();
    expect(world.upgrades.multiplier).toBe(1);
    expect(world.upgrades.multipleKill).toBe(0);
  });

  it('times the multiplier from 75 ticks at x1 down to 3 ticks at x100', () => {
    const { world } = makeWorld(playerRoom());
    expect(world.upgrades.multiplierTicks(1)).toBeCloseTo(75);
    expect(world.upgrades.multiplierTicks(100)).toBeCloseTo(3, 2);
    expect(world.upgrades.multiplierTicks(500)).toBe(world.upgrades.multiplierTicks(100));
  });

  it('applies weapon upgrades from the original stats when the class record changes', () => {
    const { world } = makeWorld(playerRoom());
    const weapon = uzi();
    world.upgrades.registerWeapon(weapon);
    world.upgrades.applyWeaponUpgrade(weapon);
    expect(weapon.ammo).toBe(100);
    world.upgrades.logKills(22);
    world.upgrades.applyWeaponUpgrade(weapon);
    expect(weapon).toMatchObject({ fireRate: 2, fireRateCount: 0, auto: true, ammo: 200, totalAmmo: 200, range: 12 });
    weapon.ammo = 5;
    world.upgrades.applyWeaponUpgrade(weapon);
    expect(weapon.ammo).toBe(5);
  });

  it('speeds zombies up by the level factor', () => {
    const { world } = makeWorld(playerRoom());
    const zombie: UpgradableCreature = { classId: ThingClass.Zombie, speed: 0.02, upgradeStamp: undefined };
    world.upgrades.registerCreature(zombie);
    expect(zombie.speed).toBeCloseTo(0.022);
  });

  it('lists every multiplier upgrade in order with its active state', () => {
    const { world } = makeWorld(playerRoom(), { options: { difficulty: Difficulty.Intermediate } });
    const list = world.upgrades.multiplierList();
    expect(list).toHaveLength(58);
    expect(list[0]).toEqual({ index: 3, name: 'upgrade.weaponPistol.fastFire', active: true, newWeapon: false });
    expect(list.find((entry) => entry.index === 13)?.active).toBe(false);
  });
});
