import type { TextKey } from '../../text/i18n.ts';
import { ThingClass } from '../things/ThingClass.ts';
import { WeaponName } from '../weapons/WeaponName.ts';
import {
  DEVIL_COUNT_MAX,
  DEVIL_COUNT_STEP,
  DEVIL_FIRST_COUNT,
  DEVIL_START_SPAWN_SECONDS,
  DEVIL_TOTAL_STEP,
  FIRST_LEVEL,
  LEVEL_COUNT,
  MIN_SPAWN_RATE_TICKS,
  SPEED_UP_MAX,
  SPEED_UP_PER_HUNDRED_LEVELS,
  ZOMBIE_COUNT_MAX,
  ZOMBIE_COUNT_STEP,
  ZOMBIE_START_COUNT,
  ZOMBIE_START_SPAWN_SECONDS,
  ZOMBIE_START_TOTAL,
  ZOMBIE_TOTAL_STEP,
} from './tuning.ts';
import { UpgradeProp } from './UpgradeProp.ts';

export const UpgradeKind = {
  Stat: 'stat',
  NewWeapon: 'newWeapon',
} as const;

export interface StatUpgrade {
  readonly kind: typeof UpgradeKind.Stat;
  readonly index: number;
  readonly target: ThingClass;
  readonly prop: UpgradeProp;
  readonly name: TextKey;
}

export interface NewWeaponUpgrade {
  readonly kind: typeof UpgradeKind.NewWeapon;
  readonly index: number;
  readonly weapon: WeaponName;
  readonly name: TextKey;
}

export type MultiplierUpgrade = StatUpgrade | NewWeaponUpgrade;

function upgrade(index: number, target: ThingClass, prop: UpgradeProp, name: TextKey): StatUpgrade {
  return { kind: UpgradeKind.Stat, index, target, prop, name };
}

function newWeapon(index: number, weapon: WeaponName, name: TextKey): NewWeaponUpgrade {
  return { kind: UpgradeKind.NewWeapon, index, weapon, name };
}

export const MULTIPLIER_UPGRADES: readonly MultiplierUpgrade[] = [
  upgrade(3, ThingClass.WeaponPistol, UpgradeProp.FastFire, 'upgrade.weaponPistol.fastFire'),
  newWeapon(5, WeaponName.Uzi, 'upgrade.newWeapon.uzi'),
  upgrade(8, ThingClass.WeaponPistol, UpgradeProp.DoubleDamage, 'upgrade.weaponPistol.doubleDamage'),
  newWeapon(10, WeaponName.Shotgun, 'upgrade.newWeapon.shotgun'),
  upgrade(13, ThingClass.WeaponUzi, UpgradeProp.RapidFire, 'upgrade.weaponUzi.rapidFire'),
  newWeapon(15, WeaponName.Barrel, 'upgrade.newWeapon.barrel'),
  upgrade(17, ThingClass.WeaponUzi, UpgradeProp.DoubleAmmo, 'upgrade.weaponUzi.doubleAmmo'),
  upgrade(18, ThingClass.WeaponShotgun, UpgradeProp.FastFire, 'upgrade.weaponShotgun.fastFire'),
  newWeapon(20, WeaponName.Grenade, 'upgrade.newWeapon.grenade'),
  upgrade(21, ThingClass.WeaponShotgun, UpgradeProp.DoubleAmmo, 'upgrade.weaponShotgun.doubleAmmo'),
  upgrade(23, ThingClass.WeaponUzi, UpgradeProp.LongShot, 'upgrade.weaponUzi.longShot'),
  upgrade(26, ThingClass.WeaponBarrel, UpgradeProp.DoubleAmmo, 'upgrade.weaponBarrel.doubleAmmo'),
  newWeapon(30, WeaponName.FakeWall, 'upgrade.newWeapon.fakeWall'),
  upgrade(31, ThingClass.WeaponShotgun, UpgradeProp.WideShot, 'upgrade.weaponShotgun.wideShot'),
  upgrade(32, ThingClass.Barrel, UpgradeProp.BigBang, 'upgrade.barrel.bigBang'),
  upgrade(33, ThingClass.WeaponGrenade, UpgradeProp.ClusterExplode, 'upgrade.weaponGrenade.clusterExplode'),
  upgrade(35, ThingClass.WeaponShotgun, UpgradeProp.LongShot, 'upgrade.weaponShotgun.longShot'),
  upgrade(36, ThingClass.WeaponBarrel, UpgradeProp.QuadAmmo, 'upgrade.weaponBarrel.quadAmmo'),
  upgrade(37, ThingClass.WeaponFakeWall, UpgradeProp.DoubleAmmo, 'upgrade.weaponFakeWall.doubleAmmo'),
  upgrade(39, ThingClass.WeaponUzi, UpgradeProp.QuadAmmo, 'upgrade.weaponUzi.quadAmmo'),
  newWeapon(40, WeaponName.Mine, 'upgrade.newWeapon.mine'),
  upgrade(41, ThingClass.WeaponShotgun, UpgradeProp.QuadAmmo, 'upgrade.weaponShotgun.quadAmmo'),
  upgrade(42, ThingClass.WeaponGrenade, UpgradeProp.DoubleAmmo, 'upgrade.weaponGrenade.doubleAmmo'),
  upgrade(43, ThingClass.WeaponShotgun, UpgradeProp.RapidFire, 'upgrade.weaponShotgun.rapidFire'),
  upgrade(44, ThingClass.Barrel, UpgradeProp.BiggerBang, 'upgrade.barrel.biggerBang'),
  upgrade(45, ThingClass.WeaponGrenade, UpgradeProp.BigBang, 'upgrade.weaponGrenade.bigBang'),
  upgrade(47, ThingClass.Mine, UpgradeProp.ClusterExplode, 'upgrade.mine.clusterExplode'),
  upgrade(48, ThingClass.WeaponUzi, UpgradeProp.DoubleDamage, 'upgrade.weaponUzi.doubleDamage'),
  newWeapon(50, WeaponName.Rocket, 'upgrade.newWeapon.rocket'),
  upgrade(51, ThingClass.WeaponShotgun, UpgradeProp.WiderShot, 'upgrade.weaponShotgun.widerShot'),
  upgrade(52, ThingClass.WeaponGrenade, UpgradeProp.QuadAmmo, 'upgrade.weaponGrenade.quadAmmo'),
  upgrade(53, ThingClass.WeaponFakeWall, UpgradeProp.QuadAmmo, 'upgrade.weaponFakeWall.quadAmmo'),
  upgrade(54, ThingClass.WeaponMine, UpgradeProp.DoubleAmmo, 'upgrade.weaponMine.doubleAmmo'),
  newWeapon(55, WeaponName.ChargePack, 'upgrade.newWeapon.chargePack'),
  upgrade(56, ThingClass.WeaponShotgun, UpgradeProp.DoubleDamage, 'upgrade.weaponShotgun.doubleDamage'),
  upgrade(57, ThingClass.WeaponGrenade, UpgradeProp.BiggerBang, 'upgrade.weaponGrenade.biggerBang'),
  upgrade(58, ThingClass.Mine, UpgradeProp.BigBang, 'upgrade.mine.bigBang'),
  upgrade(59, ThingClass.WeaponRocket, UpgradeProp.FastFire, 'upgrade.weaponRocket.fastFire'),
  upgrade(61, ThingClass.WeaponUzi, UpgradeProp.InfinateRange, 'upgrade.weaponUzi.infinateRange'),
  upgrade(62, ThingClass.Mine, UpgradeProp.BiggerBang, 'upgrade.mine.biggerBang'),
  upgrade(63, ThingClass.ChargePack, UpgradeProp.ClusterExplode, 'upgrade.chargePack.clusterExplode'),
  upgrade(64, ThingClass.WeaponMine, UpgradeProp.QuadAmmo, 'upgrade.weaponMine.quadAmmo'),
  upgrade(66, ThingClass.WeaponRocket, UpgradeProp.DoubleAmmo, 'upgrade.weaponRocket.doubleAmmo'),
  upgrade(68, ThingClass.WeaponChargePack, UpgradeProp.DoubleAmmo, 'upgrade.weaponChargePack.doubleAmmo'),
  newWeapon(70, WeaponName.Railgun, 'upgrade.newWeapon.railgun'),
  upgrade(72, ThingClass.WeaponRocket, UpgradeProp.BigBang, 'upgrade.weaponRocket.bigBang'),
  upgrade(74, ThingClass.ChargePack, UpgradeProp.BigBang, 'upgrade.chargePack.bigBang'),
  upgrade(76, ThingClass.WeaponChargePack, UpgradeProp.QuadAmmo, 'upgrade.weaponChargePack.quadAmmo'),
  upgrade(78, ThingClass.WeaponRailgun, UpgradeProp.FastFire, 'upgrade.weaponRailgun.fastFire'),
  upgrade(80, ThingClass.WeaponRailgun, UpgradeProp.DoubleAmmo, 'upgrade.weaponRailgun.doubleAmmo'),
  upgrade(85, ThingClass.WeaponRocket, UpgradeProp.QuadAmmo, 'upgrade.weaponRocket.quadAmmo'),
  upgrade(90, ThingClass.WeaponUzi, UpgradeProp.QuadDamage, 'upgrade.weaponUzi.quadDamage'),
  upgrade(95, ThingClass.ChargePack, UpgradeProp.BiggerBang, 'upgrade.chargePack.biggerBang'),
  upgrade(100, ThingClass.WeaponRailgun, UpgradeProp.RapidFire, 'upgrade.weaponRailgun.rapidFire'),
  upgrade(105, ThingClass.WeaponRocket, UpgradeProp.BiggerBang, 'upgrade.weaponRocket.biggerBang'),
  upgrade(110, ThingClass.WeaponRailgun, UpgradeProp.QuadAmmo, 'upgrade.weaponRailgun.quadAmmo'),
  upgrade(120, ThingClass.WeaponRocket, UpgradeProp.RapidFire, 'upgrade.weaponRocket.rapidFire'),
  upgrade(125, ThingClass.WeaponRailgun, UpgradeProp.LongShot, 'upgrade.weaponRailgun.longShot'),
];

export interface DevilLevel {
  readonly spawnRate: number;
  readonly count: number;
  readonly totalCount: number;
  readonly speedUp: number;
}

export interface LevelDefinition {
  readonly index: number;
  readonly zombieSpawnRate: number;
  readonly zombieCount: number;
  readonly zombieTotalCount: number;
  readonly zombieSpeedUp: number;
  readonly devil?: DevilLevel;
}

export function speedUpForLevel(level: number): number {
  return Math.min(1 + (level / LEVEL_COUNT) * SPEED_UP_PER_HUNDRED_LEVELS, SPEED_UP_MAX);
}

export function buildLevels(ticksPerSecond: number, devilsActive: boolean): readonly LevelDefinition[] {
  const levels: LevelDefinition[] = [];
  let zombieRate = ZOMBIE_START_SPAWN_SECONDS * ticksPerSecond;
  let zombieCount = ZOMBIE_START_COUNT;
  let zombieTotal = ZOMBIE_START_TOTAL;
  let devilRate = DEVIL_START_SPAWN_SECONDS * ticksPerSecond;
  let devilCount = 0;
  let devilTotal = 0;
  for (let level = FIRST_LEVEL; level <= LEVEL_COUNT; level++) {
    const base = {
      index: level,
      zombieSpawnRate: Math.floor(zombieRate),
      zombieCount: Math.floor(zombieCount),
      zombieTotalCount: Math.floor(zombieTotal),
      zombieSpeedUp: speedUpForLevel(level),
    };
    zombieRate = Math.max(zombieRate - 1, MIN_SPAWN_RATE_TICKS);
    zombieCount = Math.min(zombieCount + ZOMBIE_COUNT_STEP, ZOMBIE_COUNT_MAX);
    zombieTotal += ZOMBIE_TOTAL_STEP;
    if (!devilsActive) {
      levels.push(base);
      continue;
    }
    const devil: DevilLevel = {
      spawnRate: Math.floor(devilRate),
      count: Math.floor(devilCount),
      totalCount: Math.floor(devilTotal),
      speedUp: speedUpForLevel(level),
    };
    devilCount = Math.min(level !== FIRST_LEVEL ? devilCount + DEVIL_COUNT_STEP : DEVIL_FIRST_COUNT, DEVIL_COUNT_MAX);
    devilTotal = level !== FIRST_LEVEL ? devilTotal + DEVIL_TOTAL_STEP : DEVIL_FIRST_COUNT;
    devilRate = Math.max(devilRate - 1, ticksPerSecond);
    levels.push({ ...base, devil });
  }
  return levels;
}

export const LEVEL_TARGETS = { zombie: ThingClass.Zombie, devil: ThingClass.Devil } as const;
