import { describe, expect, it } from 'vitest';
import type { RoomIndex } from '../../../src/adapters/assets/schemas.ts';
import { CompletionState } from '../../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { OnlineStatus, type OnlineState } from '../../../src/services/online/OnlineClient.ts';
import { OnlineEnd } from '../../../src/services/online/OnlineGameSession.ts';
import { LobbyCommand, lobbyViewModel, optionsSummary } from '../../../src/ui/screens/online/lobbyModel.ts';
import { lobby, OPTIONS } from '../../services/online/support.ts';

const ROOMS: RoomIndex = {
  formatVersion: 1,
  rooms: [{ index: 0, id: 'ROOM_Single_0001', file: 'a.json', name: 'BOXY', iconFrame: 0, exclusive: { single: false, coop: false, deathMatch: false } }],
};

const ONLINE: OnlineState = { status: OnlineStatus.Online, clientId: 'c2', lobbies: [], lobby: undefined, error: undefined, leftReason: undefined, result: undefined };

describe('lobby view model', () => {
  it('lists games of the mode with the level name and offers hosting', () => {
    const state: OnlineState = {
      ...ONLINE,
      lobbies: [
        { id: 'l1', name: "Ann's game", mode: GameMode.Coop, roomId: 'ROOM_Single_0001', state: 'waiting', players: 2, maxPlayers: 4 },
        { id: 'l2', name: 'Full', mode: GameMode.Coop, roomId: 'ROOM_Single_0001', state: 'playing', players: 4, maxPlayers: 4 },
        { id: 'l3', name: 'Other mode', mode: GameMode.DeathMatch, roomId: 'ROOM_Single_0001', state: 'waiting', players: 1, maxPlayers: 4 },
      ],
    };
    const model = lobbyViewModel({ mode: GameMode.Coop, state, rooms: ROOMS, character: 3, result: undefined });
    expect(model.title).toBe('COOPERATIVE ONLINE');
    expect(model.browser?.rows).toEqual([
      { id: 'l1', text: "Ann's game · BOXY · 2/4 · waiting", joinable: true },
      { id: 'l2', text: 'Full · BOXY · 4/4 · playing', joinable: false },
    ]);
    expect(model.commands).toEqual([LobbyCommand.Host, LobbyCommand.Back]);
  });

  it('shows the waiting room with member tags; only the host may start or change the level', () => {
    const guest = lobbyViewModel({ mode: GameMode.Coop, state: { ...ONLINE, lobby: lobby() }, rooms: ROOMS, character: 0, result: undefined });
    expect(guest.room?.members.map((member) => member.text)).toEqual(['Ann · BAMBO · host', 'Bob · SWAT · you']);
    expect(guest.room?.level).toBe('Level: BOXY');
    expect(guest.room?.waitingText).toBe('Waiting for the host to start…');
    expect(guest.commands).toEqual([LobbyCommand.Leave]);
    const host = lobbyViewModel({ mode: GameMode.Coop, state: { ...ONLINE, clientId: 'c1', lobby: lobby() }, rooms: ROOMS, character: 3, result: undefined });
    expect(host.commands).toEqual([LobbyCommand.Start, LobbyCommand.ChangeLevel, LobbyCommand.Leave]);
  });

  it('offers joining a running match to a member outside it', () => {
    const running = lobby({ state: 'playing', members: [{ id: 'c1', name: 'Ann', character: 3, host: true, connected: false, playerIndex: 0 }, { id: 'c2', name: 'Bob', character: 0, host: false, connected: true, playerIndex: null }] });
    const model = lobbyViewModel({ mode: GameMode.Coop, state: { ...ONLINE, lobby: running }, rooms: ROOMS, character: 0, result: undefined });
    expect(model.commands).toEqual([LobbyCommand.JoinGame, LobbyCommand.Leave]);
    expect(model.room?.members[0]).toEqual({ text: 'Ann · BAMBO · host · in game · offline', offline: true });
  });

  it('explains errors and results', () => {
    const error = lobbyViewModel({ mode: GameMode.Coop, state: { ...ONLINE, error: 'lobbyFull' }, rooms: ROOMS, character: 0, result: undefined });
    expect(error.notice).toBe('That game is full.');
    const won = { end: OnlineEnd.Finished, state: CompletionState.PlayerWon, gameOver: { type: 'gameOver', matchId: 'm', state: CompletionState.PlayerWon, winnerName: 'Bob', score: 0 } } as const;
    expect(lobbyViewModel({ mode: GameMode.DeathMatch, state: ONLINE, rooms: ROOMS, character: 0, result: won }).notice).toBe('Bob wins!');
    const dead = { end: OnlineEnd.Finished, state: CompletionState.PlayerDead, gameOver: { type: 'gameOver', matchId: 'm', state: CompletionState.PlayerDead, winnerName: null, score: 1234 } } as const;
    expect(lobbyViewModel({ mode: GameMode.Coop, state: ONLINE, rooms: ROOMS, character: 0, result: dead }).notice).toBe('Game over! Score 1234');
  });

  it('summarizes options per mode', () => {
    expect(optionsSummary(GameMode.Coop, OPTIONS)).toBe('Beginner · Normal speed · Devils on · Collisions on · Friendly fire on');
    expect(optionsSummary(GameMode.DeathMatch, OPTIONS)).toBe('First to 10 kills · Normal speed · Collisions on');
  });
});
