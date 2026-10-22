import { DevastatorWeapon, PistolWeapon, RailgunWeapon, ShotgunWeapon, UziWeapon } from './firearms.ts';
import { BarrelWeapon, ChargePackWeapon, FakeWallWeapon, GrenadeWeapon, MineWeapon, RocketWeapon, SmartBombWeapon } from './explosives.ts';
import type { Weapon, WeaponHolder } from './Weapon.ts';
import type { WeaponId } from './WeaponId.ts';

const WEAPON_CONSTRUCTORS: Readonly<Record<WeaponId, new (holder: WeaponHolder) => Weapon>> = {
  pistol: PistolWeapon,
  uzi: UziWeapon,
  shotgun: ShotgunWeapon,
  barrel: BarrelWeapon,
  grenade: GrenadeWeapon,
  fakewall: FakeWallWeapon,
  mine: MineWeapon,
  rocket: RocketWeapon,
  chargepack: ChargePackWeapon,
  railgun: RailgunWeapon,
  devastator: DevastatorWeapon,
  smartbomb: SmartBombWeapon,
};

export function createWeapon(id: WeaponId, holder: WeaponHolder): Weapon {
  return new WEAPON_CONSTRUCTORS[id](holder);
}
