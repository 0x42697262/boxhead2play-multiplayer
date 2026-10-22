export const AffectType = {
  None: 0,
  Bullet: 1,
  Electrocuted: 2,
  Explosion: 4,
  Punched: 8,
  Push: 16,
  Vaporize: 32,
  ZombieAttack: 64,
  PlayerLineOfSight: 128,
  DevilAttack: 256,
  FireBall: 512,
} as const;

export type AffectType = (typeof AffectType)[keyof typeof AffectType];
