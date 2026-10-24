export const LEVEL_COUNT = 100;
export const FIRST_LEVEL = 1;

export const ZOMBIE_START_SPAWN_SECONDS = 1;
export const ZOMBIE_START_COUNT = 10;
export const ZOMBIE_START_TOTAL = 10;
export const ZOMBIE_COUNT_STEP = 5;
export const ZOMBIE_TOTAL_STEP = 5;
export const ZOMBIE_COUNT_MAX = 60;
export const MIN_SPAWN_RATE_TICKS = 1;

export const DEVIL_START_SPAWN_SECONDS = 10;
export const DEVIL_FIRST_COUNT = 1;
export const DEVIL_COUNT_STEP = 0.3;
export const DEVIL_TOTAL_STEP = 0.25;
export const DEVIL_COUNT_MAX = 5;

export const SPEED_UP_PER_HUNDRED_LEVELS = 10;
export const SPEED_UP_MAX = 5;

export const MAX_LIVE_ZOMBIES_DETAIL = 60;
export const MAX_LIVE_ZOMBIES_LOW = 40;
export const SCALING_FIRST_EXTRA_PLAYER = 2;
export const ZOMBIES_PER_EXTRA_PLAYER = 0.5;
export const DEVILS_PER_EXTRA_PLAYER = 0.5;
export const MAX_LIVE_ZOMBIES_SCALED = 120;
export const MAX_LIVE_DEVILS_SCALED = 20;
export const DEVIL_COUNTDOWN_STEP_WITH_ZOMBIES = 1;
export const DEVIL_COUNTDOWN_STEP_ONLY_DEVILS = 10;

export const MULTIPLIER_MIN = 1;
export const MULTIPLIER_MAX = 999;
export const MULTIPLIER_TIMER_LEVELS = 100;
export const MULTIPLIER_TIMER_EXPONENT = 2.5;
export const MULTIPLIER_TIMER_DIVISOR = 100000.00000000003;
export const MULTIPLIER_TIMER_SECONDS = 3;
export const MULTIPLIER_TIMER_MIN_TICKS = 3;
export const MULTIPLE_KILL_TIMER_DIVISOR = 6;
export const MULTIPLE_KILL_IDLE_TICKS = 100000;

export const DIFFICULTY_START = [
  { level: 1, multiplier: 1 },
  { level: 10, multiplier: 10 },
  { level: 20, multiplier: 30 },
  { level: 35, multiplier: 50 },
] as const;

export const DEATHMATCH_START = { level: 1, multiplier: 200 } as const;

export const DAMAGE_FACTOR = { Fatal: 10, Quad: 4, Double: 2 } as const;
export const AMMO_FACTOR = { Quad: 4, Double: 2 } as const;
export const RAPID_FIRE_DIVISOR = 4;
export const RAPID_FIRE_MIN_RATE = 2;
export const BIG_BANG_LEVEL = 1;
export const BIGGER_BANG_LEVEL = 2;
export const WIDE_SHOT_LEVEL = 1;
export const WIDER_SHOT_LEVEL = 2;
export const CLUSTER_EXPLODE_LEVEL = 1;
export const INFINITE_RANGE_CELLS = 100;
export const LONG_SHOT_FACTOR = 1.5;
