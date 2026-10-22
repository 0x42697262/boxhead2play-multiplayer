export const EXPLOSION = {
  baseRangeCells: 2,
  rangeDamageThreshold: 100,
  rangePerDamage: 0.005,
  animationSpeed: 2.5,
  shakeX: 0,
  shakeY: 30,
  brightness: 1,
  clusterShells: 4,
  clusterJitterDivisor: 2,
  bangSpreadFactor: 1.5,
  bangJitterDivisor: 4,
  bangMinDelayTicks: 2,
  bangDelayChoices: 4,
} as const;

export const EFFECT_ANIMATION_SPEED = 1;
export const SMOKE_DRIFT_SPEED = 0.5;
export const SMOKE_DRIFT_ACCELERATION = 1.2;
export const MUZZLE_FLASH_DIRECTIONS = 8;
export const SMART_BOMB_LIFE = 10;
