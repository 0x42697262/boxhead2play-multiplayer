import type { WeaponName } from '../weapons/WeaponName.ts';
import type { Thing } from './Thing.ts';
import { ThingClass } from './ThingClass.ts';

export interface PlayerHudStatus {
  readonly lifeRatio: number;
  readonly weaponShortName: string;
  readonly ammo: number | undefined;
  readonly visible: boolean;
}

export interface PlayerCapabilities {
  readonly playerIndex: number;
  life: number;
  maxLife: number;
  newWeapon(name: WeaponName): void;
  resetWeapons(): void;
  hudStatus(): PlayerHudStatus;
}

export type PlayerThing = Thing & PlayerCapabilities;

export function isPlayer(thing: Thing): thing is PlayerThing {
  return thing.classId === ThingClass.Player;
}
