export const CompletionState = {
  Error: 'error',
  Quit: 'quit',
  PlayerDead: 'playerDead',
  Player1Wins: 'player1Wins',
  Player2Wins: 'player2Wins',
} as const;

export type CompletionState = (typeof CompletionState)[keyof typeof CompletionState];
