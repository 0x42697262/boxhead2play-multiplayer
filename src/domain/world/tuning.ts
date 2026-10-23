export const BASE_TICKS_PER_SECOND = 25;
export const SLOW_SPEED_FACTOR = 0.5;

export const SCREEN_WIDTH_PX = 640;
export const SCREEN_HEIGHT_PX = 480;

export const KILLS_TO_WIN = [5, 10, 20, 50] as const;

export const MAX_PLAYERS = 4;
export const OPEN_SPAWN_SEARCH_CELLS = 64;

export const SPAWN_MIN_DISTANCE_SQUARED = 4;
export const PLAYER_SCOPE_CELLS_X = 19;
export const PLAYER_SCOPE_CELLS_Y = 13;

export const DROPPED_PICKUP_SECONDS = 10;
export const PICKUP_EVERY_N_KILLS = 5;

export const SHAKE_LIMIT_PX = 32;
export const SHAKE_DAMPING = -0.5;
export const SHAKE_REST_PX = 0.1;

export const INITIAL_BRIGHTNESS = 1;
export const BRIGHTNESS_STEP = 0.2;

export const CAMERA_FOLLOW_SPEED_CELLS = 0.16;
export const CAMERA_CATCH_UP_DIVISOR = 5;

export const AMBIENCE_LEVELS = [
  { maxZombies: 1, channels: 1, frequencyTicks: 150 },
  { maxZombies: 2, channels: 1, frequencyTicks: 150 },
  { maxZombies: 4, channels: 2, frequencyTicks: 150 },
  { maxZombies: 8, channels: 3, frequencyTicks: 60 },
  { maxZombies: Number.POSITIVE_INFINITY, channels: 3, frequencyTicks: 1 },
] as const;
export const AMBIENCE_SAMPLE_SLOTS = 4;
