export const SoundId = {
  CreatureHitFloor: 'creatureHitFloor',
  PlayerScream1: 'playerScream1',
  PlayerScream2: 'playerScream2',
  ZombieHit1: 'zombieHit1',
  ZombieHit2: 'zombieHit2',
  ZombieHit3: 'zombieHit3',
  ZombieHit4: 'zombieHit4',
  ZombieAttack: 'zombieAttack',
  ZombieHit: 'zombieHit',
  EffectExplosion: 'effectExplosion',
  BarrelPlace: 'barrelPlace',
  MineDetonate: 'mineDetonate',
  Pickup: 'pickup',
  GrenadeBounce: 'grenadeBounce',
  ShotHitWall1: 'shotHitWall1',
  ShotHitWall2: 'shotHitWall2',
  ShotHitWall3: 'shotHitWall3',
  ShotRocketFire: 'shotRocketFire',
  MinePlace: 'minePlace',
  PistolFire: 'pistolFire',
  RailgunFire: 'railgunFire',
  RocketFire: 'rocketFire',
  ShotgunFire: 'shotgunFire',
  UziFire: 'uziFire',
  WorldEnd: 'worldEnd',
  Click: 'click',
  Click2: 'click2',
  ZombieAmbience1: 'zombieAmbience1',
  ZombieAmbience2: 'zombieAmbience2',
  ZombieAmbience3: 'zombieAmbience3',
  ZombieAmbience4: 'zombieAmbience4',
} as const;

export type SoundId = (typeof SoundId)[keyof typeof SoundId];

export const SoundPlayback = {
  Positional: 'positional',
  Normal: 'normal',
} as const;

export type SoundPlayback = (typeof SoundPlayback)[keyof typeof SoundPlayback];

export interface SoundSample {
  readonly linkage: string;
  readonly volume: number;
  readonly playback: SoundPlayback;
}

const QUIET = 0.4;
const SCREAM = 0.7;
const SOFT = 0.3;
const FULL = 1;

function positional(linkage: string, volume: number): SoundSample {
  return { linkage, volume, playback: SoundPlayback.Positional };
}

function normal(linkage: string): SoundSample {
  return { linkage, volume: FULL, playback: SoundPlayback.Normal };
}

export const SOUND_SAMPLES: Readonly<Record<SoundId, SoundSample>> = {
  creatureHitFloor: positional('Creature.HitFloor.wav', FULL),
  playerScream1: positional('Creature.Player.Scream.1.wav', SCREAM),
  playerScream2: positional('Creature.Player.Scream.2.wav', SCREAM),
  zombieHit1: positional('Creature.Zombie.Ambience.1.wav', QUIET),
  zombieHit2: positional('Creature.Zombie.Ambience.2.wav', QUIET),
  zombieHit3: positional('Creature.Zombie.Ambience.3.wav', QUIET),
  zombieHit4: positional('Creature.Zombie.Ambience.4.wav', QUIET),
  zombieAttack: positional('Creature.Zombie.Attack.wav', FULL),
  zombieHit: positional('Creature.Zombie.Hit.wav', SOFT),
  effectExplosion: positional('Effect.Explosion.wav', FULL),
  barrelPlace: positional('Object.Barrel.Place.wav', FULL),
  mineDetonate: positional('Object.Mine.Detonate.wav', FULL),
  pickup: positional('Object.Pickup.wav', FULL),
  grenadeBounce: positional('Shot.Grenade.Bounce.wav', QUIET),
  shotHitWall1: positional('Shot.HitWall.1.wav', FULL),
  shotHitWall2: positional('Shot.HitWall.2.wav', FULL),
  shotHitWall3: positional('Shot.HitWall.3.wav', FULL),
  shotRocketFire: positional('Shot.Rocket.Fire.wav', FULL),
  minePlace: positional('Weapon.Mine.Place.wav', FULL),
  pistolFire: positional('Weapon.Pistol.Fire.wav', FULL),
  railgunFire: positional('Weapon.Railgun.Fire.wav', FULL),
  rocketFire: positional('Weapon.Rocket.Fire.wav', FULL),
  shotgunFire: positional('Weapon.ShotGun.Fire.wav', FULL),
  uziFire: positional('Weapon.UZI.Fire.wav', FULL),
  worldEnd: normal('World.End.wav'),
  click: normal('World.End.wav'),
  click2: normal('CLICK.wav'),
  zombieAmbience1: positional('Creature.Zombie.Ambience.1.wav', QUIET),
  zombieAmbience2: positional('Creature.Zombie.Ambience.2.wav', QUIET),
  zombieAmbience3: positional('Creature.Zombie.Ambience.3.wav', QUIET),
  zombieAmbience4: positional('Creature.Zombie.Ambience.4.wav', QUIET),
};

export const ZOMBIE_HIT_SOUNDS: readonly SoundId[] = [SoundId.ZombieHit1, SoundId.ZombieHit2, SoundId.ZombieHit3, SoundId.ZombieHit4];

export const SHOT_HIT_WALL_SOUNDS: readonly SoundId[] = [SoundId.ShotHitWall1, SoundId.ShotHitWall2, SoundId.ShotHitWall3];

export const ZOMBIE_AMBIENCE_SOUNDS: readonly SoundId[] = [
  SoundId.ZombieAmbience1,
  SoundId.ZombieAmbience2,
  SoundId.ZombieAmbience3,
  SoundId.ZombieAmbience4,
];
