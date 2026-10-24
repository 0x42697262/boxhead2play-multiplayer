import {
  DEVILS_PER_EXTRA_PLAYER,
  MAX_LIVE_DEVILS_SCALED,
  MAX_LIVE_ZOMBIES_SCALED,
  SCALING_FIRST_EXTRA_PLAYER,
  ZOMBIES_PER_EXTRA_PLAYER,
} from './tuning.ts';

export interface LevelBase {
  readonly zombieCount: number;
  readonly zombieTotalCount: number;
  readonly devilCount: number;
  readonly devilTotalCount: number;
}

export interface ExtraEnemies {
  readonly zombieCount: number;
  readonly zombieTotalCount: number;
  readonly devilCount: number;
  readonly devilTotalCount: number;
}

export const NO_EXTRA_ENEMIES: ExtraEnemies = { zombieCount: 0, zombieTotalCount: 0, devilCount: 0, devilTotalCount: 0 };

export function extraPlayers(players: number): number {
  return Math.max(players - SCALING_FIRST_EXTRA_PLAYER + 1, 0);
}

export function extraEnemies(base: LevelBase, players: number): ExtraEnemies {
  const extra = extraPlayers(players);
  const zombies = extra * ZOMBIES_PER_EXTRA_PLAYER;
  const devils = extra * DEVILS_PER_EXTRA_PLAYER;
  return {
    zombieCount: Math.floor(base.zombieCount * zombies),
    zombieTotalCount: Math.floor(base.zombieTotalCount * zombies),
    devilCount: Math.floor(base.devilCount * devils),
    devilTotalCount: Math.floor(base.devilTotalCount * devils),
  };
}

export function liveZombieCap(baseCap: number, players: number): number {
  return Math.min(Math.floor(baseCap * (1 + extraPlayers(players) * ZOMBIES_PER_EXTRA_PLAYER)), Math.max(baseCap, MAX_LIVE_ZOMBIES_SCALED));
}

export function liveDevilCap(players: number): number {
  return extraPlayers(players) === 0 ? Number.POSITIVE_INFINITY : MAX_LIVE_DEVILS_SCALED;
}
