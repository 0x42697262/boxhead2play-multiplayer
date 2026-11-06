export const GameMode = {
  Single: 'single',
  Coop: 'coop',
  DeathMatch: 'deathMatch',
  TeamBattle: 'teamBattle',
} as const;

export type GameMode = (typeof GameMode)[keyof typeof GameMode];

export function usesDeathMatchEquipment(mode: GameMode): boolean {
  return mode === GameMode.DeathMatch || mode === GameMode.TeamBattle;
}
