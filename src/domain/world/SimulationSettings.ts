import { GameMode } from './GameMode.ts';
import { BASE_TICKS_PER_SECOND, MAX_PLAYERS, SLOW_SPEED_FACTOR } from './tuning.ts';

export const Difficulty = {
  Beginner: 0,
  Intermediate: 1,
  Expert: 2,
  Nightmare: 3,
} as const;

export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const GameSpeed = {
  Slow: 0,
  Normal: 1,
  Fast: 2,
} as const;

export type GameSpeed = (typeof GameSpeed)[keyof typeof GameSpeed];

export const GameAmount = {
  Kills5: 0,
  Kills10: 1,
  Kills20: 2,
  Kills50: 3,
} as const;

export type GameAmount = (typeof GameAmount)[keyof typeof GameAmount];

export const RespawnTime = {
  Seconds3: 3,
  Seconds5: 5,
  Seconds10: 10,
  Seconds15: 15,
} as const;

export type RespawnTime = (typeof RespawnTime)[keyof typeof RespawnTime];

export const DEFAULT_COOP_RESPAWN: RespawnTime = RespawnTime.Seconds10;
export const DEFAULT_DEATH_MATCH_RESPAWN: RespawnTime = RespawnTime.Seconds5;

export const PlayerCharacter = {
  Swat: 0,
  Bond: 1,
  GiJoe: 2,
  Bambo: 3,
} as const;

export type PlayerCharacter = (typeof PlayerCharacter)[keyof typeof PlayerCharacter];

export interface GameOptions {
  readonly gameMode: GameMode;
  readonly difficulty: Difficulty;
  readonly gameSpeed: GameSpeed;
  readonly devilsActive: boolean;
  readonly collisionsActive: boolean;
  readonly damageActive: boolean;
  readonly gameAmount: GameAmount;
  readonly respawnSeconds: RespawnTime;
  readonly playerCharacters: readonly PlayerCharacter[];
  readonly detail: boolean;
}

export interface SimulationSettings extends GameOptions {
  readonly ticksPerSecond: number;
  readonly loadTicksPerSecond: number;
  readonly presentAmbience: boolean;
}

export interface SimulationHost {
  readonly presentAmbience: boolean;
}

export const LOCAL_SIMULATION_HOST: SimulationHost = { presentAmbience: true };

export const SERVER_SIMULATION_HOST: SimulationHost = { presentAmbience: false };

export const DEFAULT_GAME_OPTIONS: GameOptions = {
  gameMode: GameMode.Single,
  difficulty: Difficulty.Beginner,
  gameSpeed: GameSpeed.Normal,
  devilsActive: true,
  collisionsActive: true,
  damageActive: true,
  gameAmount: GameAmount.Kills10,
  respawnSeconds: DEFAULT_COOP_RESPAWN,
  playerCharacters: [PlayerCharacter.Bambo],
  detail: true,
};

export function speedFactor(speed: GameSpeed): number {
  return speed === GameSpeed.Slow ? SLOW_SPEED_FACTOR : speed;
}

export function createSimulationSettings(options: GameOptions, host: SimulationHost = LOCAL_SIMULATION_HOST): SimulationSettings {
  return Object.freeze({
    ...options,
    presentAmbience: host.presentAmbience,
    playerCharacters: Object.freeze(options.playerCharacters.slice(0, MAX_PLAYERS)),
    damageActive: options.gameMode === GameMode.DeathMatch ? true : options.damageActive,
    ticksPerSecond: BASE_TICKS_PER_SECOND * speedFactor(options.gameSpeed),
    loadTicksPerSecond: BASE_TICKS_PER_SECOND,
  });
}
