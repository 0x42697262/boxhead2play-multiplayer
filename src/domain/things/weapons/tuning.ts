import { ThingClass } from '../ThingClass.ts';
import { INFINITE_AMMO } from '../../weapons/WeaponName.ts';
import { WeaponId } from './WeaponId.ts';

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly classId: ThingClass;
  readonly fireRate: number;
  readonly ammo: number;
  readonly damage: number;
  readonly auto: boolean;
  readonly onRelease: boolean;
  readonly range: number;
}

const UNSET_RANGE = 0;

function weapon(id: WeaponId, classId: ThingClass, stats: Omit<WeaponDefinition, 'id' | 'classId' | 'onRelease' | 'range'> & Partial<Pick<WeaponDefinition, 'onRelease' | 'range'>>): WeaponDefinition {
  return { id, classId, onRelease: false, range: UNSET_RANGE, ...stats };
}

export const PISTOL = weapon(WeaponId.Pistol, ThingClass.WeaponPistol, { fireRate: 8, ammo: INFINITE_AMMO, damage: 26, auto: false, range: 8 });
export const PISTOL_BULLET_RANGE = 8;
export const UZI = weapon(WeaponId.Uzi, ThingClass.WeaponUzi, { fireRate: 4, ammo: 100, damage: 35, auto: true, range: 8 });
export const SHOTGUN = weapon(WeaponId.Shotgun, ThingClass.WeaponShotgun, { fireRate: 12, ammo: 20, damage: 51, auto: false, range: 7 });
export const ROCKET = weapon(WeaponId.Rocket, ThingClass.WeaponRocket, { fireRate: 12, ammo: 20, damage: 250, auto: false });
export const GRENADE = weapon(WeaponId.Grenade, ThingClass.WeaponGrenade, { fireRate: 12, ammo: 20, damage: 150, auto: false, onRelease: true, range: 6 });
export const MINE = weapon(WeaponId.Mine, ThingClass.WeaponMine, { fireRate: 1, ammo: 10, damage: 100, auto: false });
export const RAILGUN = weapon(WeaponId.Railgun, ThingClass.WeaponRailgun, { fireRate: 5, ammo: 15, damage: 100, auto: false, range: 10 });
export const DEVASTATOR = weapon(WeaponId.Devastator, ThingClass.WeaponDevastator, { fireRate: 4, ammo: INFINITE_AMMO, damage: 100, auto: true, range: 8 });
export const SMART_BOMB = weapon(WeaponId.SmartBomb, ThingClass.WeaponSmartBomb, { fireRate: 12, ammo: 20, damage: 100, auto: false });
export const CHARGE_PACK = weapon(WeaponId.ChargePack, ThingClass.WeaponChargePack, { fireRate: 1, ammo: 10, damage: 150, auto: false });
export const FAKE_WALL = weapon(WeaponId.FakeWall, ThingClass.WeaponFakeWall, { fireRate: 1, ammo: 5, damage: 100, auto: false });
export const BARREL = weapon(WeaponId.Barrel, ThingClass.WeaponBarrel, { fireRate: 1, ammo: 10, damage: 150, auto: false });

export const SHOTGUN_SPREAD_DEGREES = 1.25;
export const SHOTGUN_WIDE_PAIRS = 1;
export const DEGREES_PER_HALF_TURN = 180;
export const MAX_OBJECTS_IN_PLACEMENT_CELL = 1;
export const SMART_BOMB_LIFE = 3;
