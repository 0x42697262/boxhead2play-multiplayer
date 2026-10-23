export const CompletionState = {
  Error: 'error',
  Quit: 'quit',
  PlayerDead: 'playerDead',
  PlayerWon: 'playerWon',
} as const;

export type CompletionState = (typeof CompletionState)[keyof typeof CompletionState];
