import { WeaponName } from '../../weapons/WeaponName.ts';

export const UnlistedWeapon = {
  Devastator: 'devastator',
  SmartBomb: 'smartbomb',
} as const;

export const WeaponId = { ...WeaponName, ...UnlistedWeapon } as const;

export type WeaponId = (typeof WeaponId)[keyof typeof WeaponId];
