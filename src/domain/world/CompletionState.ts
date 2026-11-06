export const CompletionState = {
  Error: 'error',
  Quit: 'quit',
  PlayerDead: 'playerDead',
  PlayerWon: 'playerWon',
  Ended: 'ended',
} as const;

export type CompletionState = (typeof CompletionState)[keyof typeof CompletionState];
