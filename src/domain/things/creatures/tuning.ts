export const CREATURE_RADIUS = 0.45;
export const CREATURE_HEIGHT = 1.5;
export const CREATURE_LIFE = 100;
export const CREATURE_MASS = 1;

export const CELL_STEP_ANIMATION_SPEED = 0.34;
export const DYING_ANIMATION_SPEED = 0.34;
export const STRAIGHT_STEP_CELLS = 1;
export const DIAGONAL_STEP_CELLS = Math.SQRT2;
export const TURN_SPEED_FACTOR = 10;

export const KNOCKBACK_DECAY = 0.65;
export const KNOCKBACK_MIN_LENGTH = 0.01;
export const HIT_RECOVERY_SLEEP_TICKS = 3;
export const TURN_LOOP_SLEEP_SECONDS_DIVISOR = 3;
export const WAIT_SECONDS = 1;

export const CORPSE_SECONDS = 2;
export const PLAYER_CORPSE_SECONDS = 4;
export const CORPSE_FADE_SECONDS = 1;

export const ATTACK_SPEED_REFERENCE_TICKS = 25;
export const ATTACK_SPEED_FACTOR = 1.5;
export const MAX_ATTACK_ANIMATION_SPEED = 1;

export const ZOMBIE = {
  speed: 0.02,
  score: 100,
  height: 1.5,
  damage: 50,
  attackAnimationRate: 0.3,
  attackSleepTicks: 10,
} as const;

export const DEVIL = {
  speed: 0.04,
  radius: 0.42,
  life: 1000,
  attackRange: 5,
  attackDamage: 50,
  mass: 5,
  fireRate: 0,
  score: 1000,
  height: 1.8,
  initialFireRateCount: 5,
  attackAnimationRate: 0.2,
  fireFrame: 3,
  removeObjectDamage: 100000,
  fireballHeight: 0.84,
  fireballOffsetRadii: 1.5,
} as const;

export const PLAYER = {
  speed: 0.16,
  mass: 2,
  height: 1.5,
  life: 200,
  spawnInvincibleTicks: 200,
  regenSeconds: 30,
  walkAnimationFactor: 2,
  respawnDelayTicks: 148,
  respawnInvincibleTicks: 25,
  respawnInvincibleFactor: 5,
  deathMatchRespawnInvincibleFactor: 1,
} as const;

export const HAND_MIDPOINT = 0.5;
export const HIT_SOUND_VARIANTS = 4;
