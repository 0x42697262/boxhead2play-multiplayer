import type { CharacterCollection } from '../../animation/CharacterAnimator.ts';
import type { WeaponName } from '../../weapons/WeaponName.ts';

export const CreatureAnimation = {
  Stand: 'stand',
  Walk: 'walk',
  ShotHitRear: 'shothit_1',
  ShotHitFront: 'shothit_2',
  Dying: 'dying',
  Dead: 'dead',
  Attack: 'attack',
} as const;

export type CreatureAnimation = (typeof CreatureAnimation)[keyof typeof CreatureAnimation];

export const SHOT_HIT_ANIMATIONS: readonly CreatureAnimation[] = [CreatureAnimation.ShotHitRear, CreatureAnimation.ShotHitFront];

export interface WeaponAnimations {
  readonly walk: string;
  readonly stand: string;
}

export const WEAPON_ANIMATIONS: Readonly<Record<WeaponName, WeaponAnimations>> = {
  pistol: { walk: 'pistolwalk', stand: 'pistolstand' },
  uzi: { walk: 'uziwalk', stand: 'uzistand' },
  shotgun: { walk: 'shotgunwalk', stand: 'shotgunstand' },
  barrel: { walk: 'barrelwalk', stand: 'barrelstand' },
  grenade: { walk: 'grenadewalk', stand: 'grenadestand' },
  fakewall: { walk: 'fakewallwalk', stand: 'fakewallstand' },
  mine: { walk: 'minewalk', stand: 'minestand' },
  rocket: { walk: 'rocketwalk', stand: 'rocketstand' },
  chargepack: { walk: 'chargepackwalk', stand: 'chargepackstand' },
  railgun: { walk: 'railgunwalk', stand: 'railgunstand' },
};

const PLAYER_STAND = 'Player_Stand';
const PLAYER_WALK = 'Player_Walk';
const PLAYER_HIT_REAR = 'Player_HitRear';
const PLAYER_HIT_FRONT = 'Player_HitFront';
const PLAYER_DYING = 'Player_Dying';
const PLAYER_DEAD = 'Player_Dead';

export const PLAYER_COLLECTION: CharacterCollection = {
  [CreatureAnimation.Stand]: PLAYER_STAND,
  [CreatureAnimation.Walk]: PLAYER_WALK,
  [CreatureAnimation.ShotHitRear]: PLAYER_HIT_REAR,
  [CreatureAnimation.ShotHitFront]: PLAYER_HIT_FRONT,
  [CreatureAnimation.Dying]: PLAYER_DYING,
  [CreatureAnimation.Dead]: PLAYER_DEAD,
  [WEAPON_ANIMATIONS.pistol.walk]: 'Player_Handgun_Walk',
  [WEAPON_ANIMATIONS.pistol.stand]: 'Player_Handgun_Stand',
  [WEAPON_ANIMATIONS.shotgun.walk]: 'Player_Shotgun_Walk',
  [WEAPON_ANIMATIONS.shotgun.stand]: 'Player_Shotgun_Stand',
  [WEAPON_ANIMATIONS.uzi.walk]: 'Player_UZI_Walk',
  [WEAPON_ANIMATIONS.uzi.stand]: 'Player_UZI_Stand',
  [WEAPON_ANIMATIONS.rocket.walk]: 'Player_Rocket_Walk',
  [WEAPON_ANIMATIONS.rocket.stand]: 'Player_Rocket_Stand',
  [WEAPON_ANIMATIONS.railgun.walk]: 'Player_Railgun_Walk',
  [WEAPON_ANIMATIONS.railgun.stand]: 'Player_Railgun_Stand',
  [WEAPON_ANIMATIONS.grenade.walk]: PLAYER_WALK,
  [WEAPON_ANIMATIONS.grenade.stand]: PLAYER_STAND,
  [WEAPON_ANIMATIONS.barrel.walk]: PLAYER_WALK,
  [WEAPON_ANIMATIONS.barrel.stand]: PLAYER_STAND,
  [WEAPON_ANIMATIONS.mine.walk]: PLAYER_WALK,
  [WEAPON_ANIMATIONS.mine.stand]: PLAYER_STAND,
  claymorewalk: PLAYER_WALK,
  claymorestand: PLAYER_STAND,
  [WEAPON_ANIMATIONS.chargepack.walk]: PLAYER_WALK,
  [WEAPON_ANIMATIONS.chargepack.stand]: PLAYER_STAND,
  [WEAPON_ANIMATIONS.fakewall.walk]: PLAYER_WALK,
  [WEAPON_ANIMATIONS.fakewall.stand]: PLAYER_STAND,
};

export const ZOMBIE_COLLECTION: CharacterCollection = {
  [CreatureAnimation.Stand]: 'Zombie_Zombie_Stand',
  [CreatureAnimation.Walk]: 'Zombie_Zombie_Walk',
  [CreatureAnimation.Attack]: 'Zombie_Zombie_Attack',
  [CreatureAnimation.ShotHitRear]: PLAYER_HIT_REAR,
  [CreatureAnimation.ShotHitFront]: PLAYER_HIT_FRONT,
  [CreatureAnimation.Dying]: PLAYER_DYING,
  [CreatureAnimation.Dead]: PLAYER_DEAD,
};

export const DEVIL_COLLECTION: CharacterCollection = {
  [CreatureAnimation.Stand]: PLAYER_STAND,
  [CreatureAnimation.Walk]: PLAYER_WALK,
  [CreatureAnimation.ShotHitRear]: PLAYER_HIT_REAR,
  [CreatureAnimation.ShotHitFront]: PLAYER_HIT_FRONT,
  [CreatureAnimation.Dying]: PLAYER_DYING,
  [CreatureAnimation.Dead]: PLAYER_DEAD,
  [CreatureAnimation.Attack]: 'Devil_Devil_Attack',
};
