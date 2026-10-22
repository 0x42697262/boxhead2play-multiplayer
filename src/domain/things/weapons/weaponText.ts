import type { TextKey } from '../../../text/i18n.ts';
import type { WeaponId } from './WeaponId.ts';

export interface WeaponText {
  readonly name: TextKey;
  readonly shortName: TextKey;
  readonly selected: TextKey;
  readonly outOfAmmo: TextKey;
  readonly pickedUp: TextKey;
}

export const WEAPON_TEXT: Readonly<Record<WeaponId, WeaponText>> = {
  pistol: {
    name: 'weapon.pistol.name',
    shortName: 'weapon.pistol.shortName',
    selected: 'hud.weaponSelected.pistol',
    outOfAmmo: 'hud.outOfAmmo.pistol',
    pickedUp: 'hud.pickedUp.pistol',
  },
  uzi: {
    name: 'weapon.uzi.name',
    shortName: 'weapon.uzi.shortName',
    selected: 'hud.weaponSelected.uzi',
    outOfAmmo: 'hud.outOfAmmo.uzi',
    pickedUp: 'hud.pickedUp.uzi',
  },
  shotgun: {
    name: 'weapon.shotgun.name',
    shortName: 'weapon.shotgun.shortName',
    selected: 'hud.weaponSelected.shotgun',
    outOfAmmo: 'hud.outOfAmmo.shotgun',
    pickedUp: 'hud.pickedUp.shotgun',
  },
  barrel: {
    name: 'weapon.barrel.name',
    shortName: 'weapon.barrel.shortName',
    selected: 'hud.weaponSelected.barrel',
    outOfAmmo: 'hud.outOfAmmo.barrel',
    pickedUp: 'hud.pickedUp.barrel',
  },
  grenade: {
    name: 'weapon.grenade.name',
    shortName: 'weapon.grenade.shortName',
    selected: 'hud.weaponSelected.grenade',
    outOfAmmo: 'hud.outOfAmmo.grenade',
    pickedUp: 'hud.pickedUp.grenade',
  },
  fakewall: {
    name: 'weapon.fakewall.name',
    shortName: 'weapon.fakewall.shortName',
    selected: 'hud.weaponSelected.fakewall',
    outOfAmmo: 'hud.outOfAmmo.fakewall',
    pickedUp: 'hud.pickedUp.fakewall',
  },
  mine: {
    name: 'weapon.mine.name',
    shortName: 'weapon.mine.shortName',
    selected: 'hud.weaponSelected.mine',
    outOfAmmo: 'hud.outOfAmmo.mine',
    pickedUp: 'hud.pickedUp.mine',
  },
  rocket: {
    name: 'weapon.rocket.name',
    shortName: 'weapon.rocket.shortName',
    selected: 'hud.weaponSelected.rocket',
    outOfAmmo: 'hud.outOfAmmo.rocket',
    pickedUp: 'hud.pickedUp.rocket',
  },
  chargepack: {
    name: 'weapon.chargepack.name',
    shortName: 'weapon.chargepack.shortName',
    selected: 'hud.weaponSelected.chargepack',
    outOfAmmo: 'hud.outOfAmmo.chargepack',
    pickedUp: 'hud.pickedUp.chargepack',
  },
  railgun: {
    name: 'weapon.railgun.name',
    shortName: 'weapon.railgun.shortName',
    selected: 'hud.weaponSelected.railgun',
    outOfAmmo: 'hud.outOfAmmo.railgun',
    pickedUp: 'hud.pickedUp.railgun',
  },
  devastator: {
    name: 'weapon.devastator.name',
    shortName: 'weapon.devastator.shortName',
    selected: 'hud.weaponSelected.devastator',
    outOfAmmo: 'hud.outOfAmmo.devastator',
    pickedUp: 'hud.pickedUp.devastator',
  },
  smartbomb: {
    name: 'weapon.smartbomb.name',
    shortName: 'weapon.smartbomb.shortName',
    selected: 'hud.weaponSelected.smartbomb',
    outOfAmmo: 'hud.outOfAmmo.smartbomb',
    pickedUp: 'hud.pickedUp.smartbomb',
  },
};
