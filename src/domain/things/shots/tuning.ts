export const LINE_SHOT_RADIUS = 0.04;
export const DEFAULT_SHOT_RANGE = 10;
export const LINE_SHOT_LIFE_TICKS = 2;
export const LINE_SHOT_JITTER_CHOICES = 4;
export const LINE_SHOT_JITTER_MIN_PX = 2;
export const LINE_SHOT_DECAY = 0.75;
export const LINE_SHOT_DESTINATION_FOLLOW = 0.5;
export const LINE_SHOT_ALPHA = 75;
export const BULLET_HIT_EFFECT_CHANCE = 3;

export const BULLET_LINE = { thickness: 0.5, color: 0xcccccc } as const;
export const RAILGUN_LINE = { thickness: 2, color: 0x9966ff, alphaFactor: 0.75 } as const;
export const LASER_LENGTH_CELLS = 100;
export const LASER_GLOW_LINE = { thickness: 3, color: 0x8080ff, alphaFactor: 0.5 } as const;
export const LASER_CORE_LINE = { thickness: 2, color: 0xffffff, alphaFactor: 1 } as const;
export const DLASER_GLOW_LINE = { thickness: 3, color: 0x9966ff, alphaFactor: 0.5 } as const;
export const DLASER_CORE_LINE = { thickness: 2, color: 0x9966ff, alphaFactor: 1 } as const;

export const ROCKET = { startSpeed: 0.5, acceleration: 1.1, radius: 0.25, smokeChoices: 2, animationSpeed: 1 } as const;

export const GRENADE = {
  lifeTicks: 60,
  startHeightPx: 40,
  upwardSpeed: 0.5,
  gravity: 0.06,
  restSpeed: 0.06,
  floorBounce: 0.5,
  wallBounce: 0.25,
  radius: 0.1,
  minPower: 0.25,
  maxPower: 0.75,
  bounceSoundSpeed: 0.06,
} as const;

export const CLUSTER_SHELL = {
  minLifeTicks: 16,
  lifeChoices: 8,
  minSpeed: 0.05,
  speedRange: 0.05,
} as const;

export const DEVASTATOR = {
  speed: 0.9,
  radius: 0.25,
  firstLineCounter: 4,
  linePeriod: 2,
  lineStartCells: 0.4,
  lineStepFactor: 2,
  lineExplosions: 8,
  lineDamage: 200,
} as const;

export const FIREBALL = {
  collideRadius: 0.1,
  defaultSpeed: 0.15,
  acceleration: 1.02,
  radius: 0.25,
  objectRadius: 1,
  objectDamage: 10000,
  animationSpeed: 1,
} as const;
