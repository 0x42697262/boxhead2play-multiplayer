export const GameMode = {
  Single: 'single',
  Coop: 'coop',
  DeathMatch: 'deathMatch',
} as const;

export type GameMode = (typeof GameMode)[keyof typeof GameMode];
