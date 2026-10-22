export const WeaponName = {
  Pistol: 'pistol',
  Uzi: 'uzi',
  Shotgun: 'shotgun',
  Barrel: 'barrel',
  Grenade: 'grenade',
  FakeWall: 'fakewall',
  Mine: 'mine',
  Rocket: 'rocket',
  ChargePack: 'chargepack',
  Railgun: 'railgun',
} as const;

export type WeaponName = (typeof WeaponName)[keyof typeof WeaponName];

export const PLAYER_WEAPON_ORDER: readonly WeaponName[] = [
  WeaponName.Pistol,
  WeaponName.Uzi,
  WeaponName.Shotgun,
  WeaponName.Barrel,
  WeaponName.Grenade,
  WeaponName.FakeWall,
  WeaponName.Mine,
  WeaponName.Rocket,
  WeaponName.ChargePack,
  WeaponName.Railgun,
];

export const INFINITE_AMMO = 999999;
