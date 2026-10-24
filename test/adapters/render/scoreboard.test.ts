import { describe, expect, it } from 'vitest';
import { scoreboardRows } from '../../../src/adapters/render/hud/scoreboard.ts';


describe('death match scoreboard', () => {
  it('ranks by kills, then fewer deaths, shares the rank on ties and marks the local player', () => {
    const rows = scoreboardRows(
      {
        localPlayerIndex: 2,
        frags: [3, 5, 3, 3],
        deaths: [1, 4, 1, 0],
        players: [0, 1, 2, 3].map((playerIndex) => ({ playerIndex })),
      },
      (playerIndex) => `P${playerIndex}`,
    );
    expect(rows.map((row) => `${row.rank}:${row.name}:${row.kills}/${row.deaths}${row.local ? '*' : ''}`)).toEqual(['1:P1:5/4', '2:P3:3/0', '3:P0:3/1', '3:P2:3/1*']);
  });
});
