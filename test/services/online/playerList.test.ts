import { describe, expect, it } from 'vitest';
import type { MemberDto, NetHud } from '../../../src/net/protocol.ts';
import { PlayerPresence, playerListView } from '../../../src/services/online/playerList.ts';

const TICKS_PER_SECOND = 25;

function member(name: string, playerIndex: number | null, connected = true): MemberDto {
  return { id: name, name, character: 0, host: playerIndex === 0, connected, playerIndex };
}

function player(playerIndex: number, lifeRatio: number, respawnTicks?: number): NetHud['players'][number] {
  return {
    playerIndex,
    position: { x: 0, y: 0, z: 0 },
    status: { lifeRatio, weaponShortName: 'weapon.pistol.shortName', ammo: undefined, visible: respawnTicks === undefined, respawnTicks },
  };
}

describe('player list', () => {
  it('lists the match players in index order with presence, respawn time, life and latency', () => {
    const latencies = new Map([
      [0, 18],
      [2, 140],
    ]);
    const view = playerListView({
      members: [member('Cid', 2), member('Ann', 0), member('Lobby only', null), member('Bob', 1, false)],
      capacity: 16,
      players: [player(0, 0.5), player(1, 1), player(2, 0, 101)],
      localPlayerIndex: 0,
      latencyOf: (index) => latencies.get(index),
      ticksPerSecond: TICKS_PER_SECOND,
    });
    expect(view.count).toBe(3);
    expect(view.capacity).toBe(16);
    expect(view.rows).toEqual([
      { playerIndex: 0, name: 'Ann', local: true, presence: PlayerPresence.Alive, respawnSeconds: undefined, lifeRatio: 0.5, latencyMs: 18 },
      { playerIndex: 1, name: 'Bob', local: false, presence: PlayerPresence.Offline, respawnSeconds: undefined, lifeRatio: 0, latencyMs: undefined },
      { playerIndex: 2, name: 'Cid', local: false, presence: PlayerPresence.Dead, respawnSeconds: 5, lifeRatio: 0, latencyMs: 140 },
    ]);
  });

  it('shows a player who joined before their first frame as alive at full life', () => {
    const view = playerListView({ members: [member('Ann', 0)], capacity: 16, players: [], localPlayerIndex: 0, latencyOf: () => undefined, ticksPerSecond: TICKS_PER_SECOND });
    expect(view.rows[0]).toMatchObject({ presence: PlayerPresence.Alive, lifeRatio: 1 });
  });
});
