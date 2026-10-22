import type { ThingClass } from '../things/ThingClass.ts';

export interface WeaponStats {
  auto: boolean;
  fireRate: number;
  ammo: number;
  totalAmmo: number;
  damage: number;
  wideShot: number;
  biggerBang: number;
  range: number;
}

export interface UpgradeStamped {
  readonly classId: ThingClass;
  upgradeStamp: number | undefined;
}

export interface UpgradableWeapon extends WeaponStats, UpgradeStamped {
  fireRateCount: number;
  clusterExplode: number;
  homingMissiles: boolean;
}

export interface UpgradableCreature extends UpgradeStamped {
  speed: number;
}

export interface UpgradableObject extends UpgradeStamped {
  biggerBang: number;
  clusterExplode: number;
}
