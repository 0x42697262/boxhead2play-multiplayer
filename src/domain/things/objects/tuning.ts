export const BARREL = {
  defaultDamage: 100,
  life: 1,
  height: 1,
  radius: 0.42,
} as const;

export const WALL = {
  life: 1000,
  height: 1,
  radius: 0.42,
  grownRadius: 0.48,
  fadeStep: 20,
  fadeOutBelow: 10,
} as const;

export const MINE = {
  defaultDamage: 100,
  idleFramesPerSecond: 1,
  detonateSeconds: 2,
  detonateAnimationSpeed: 1,
} as const;

export const CHARGE_PACK = {
  defaultDamage: 100,
  idleFramesPerSecond: 1,
  detonateSecondsDivisor: 10,
  detonateAnimationSpeed: 1,
} as const;

export const PICKUP = {
  reappearSeconds: 30,
  deathMatchReappearSeconds: 10,
  fadeSeconds: 1,
} as const;
