export const ThingBaseClass = {
  Creature: 'creature',
  Object: 'object',
  Shot: 'shot',
  Effect: 'effect',
  Weapon: 'weapon',
} as const;

export type ThingBaseClass = (typeof ThingBaseClass)[keyof typeof ThingBaseClass];

export const ThingClass = {
  Player: 'creature.player',
  Zombie: 'creature.zombie',
  Devil: 'creature.devil',
  Barrel: 'object.barrel',
  Wall: 'object.wall',
  WallMovable: 'object.wallMovable',
  Pickup: 'object.pickup',
  Mine: 'object.mine',
  ChargePack: 'object.chargePack',
  LaserNode: 'object.laserNode',
  ShotBullet: 'shot.bullet',
  ShotClusterShell: 'shot.clusterShell',
  ShotDevastator: 'shot.devastator',
  ShotDLaser: 'shot.dLaser',
  ShotFireBall: 'shot.fireBall',
  ShotGrenade: 'shot.grenade',
  ShotHomingMissile: 'shot.homingMissile',
  ShotLaser: 'shot.laser',
  ShotRailgun: 'shot.railgun',
  ShotRocket: 'shot.rocket',
  EffectBloodPool: 'effect.bloodPool',
  EffectBloodSplat: 'effect.bloodSplat',
  EffectBulletHit: 'effect.bulletHit',
  EffectExplosion: 'effect.explosion',
  EffectFireBallHeld: 'effect.fireBallHeld',
  EffectMuzzleFlash: 'effect.muzzleFlash',
  EffectRocketSmoke: 'effect.rocketSmoke',
  EffectSmartBomb: 'effect.smartBomb',
  EffectSmokeCloud: 'effect.smokeCloud',
  WeaponPistol: 'weapon.pistol',
  WeaponUzi: 'weapon.uzi',
  WeaponShotgun: 'weapon.shotgun',
  WeaponBarrel: 'weapon.barrel',
  WeaponGrenade: 'weapon.grenade',
  WeaponFakeWall: 'weapon.fakeWall',
  WeaponMine: 'weapon.mine',
  WeaponRocket: 'weapon.rocket',
  WeaponChargePack: 'weapon.chargePack',
  WeaponRailgun: 'weapon.railgun',
  WeaponDevastator: 'weapon.devastator',
  WeaponSmartBomb: 'weapon.smartBomb',
} as const;

export type ThingClass = (typeof ThingClass)[keyof typeof ThingClass];

const BASE_SEPARATOR = '.';

export function baseClassOf(classId: ThingClass): ThingBaseClass {
  return classId.slice(0, classId.indexOf(BASE_SEPARATOR)) as ThingBaseClass;
}
