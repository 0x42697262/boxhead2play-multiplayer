import { describe, expect, it } from 'vitest';
import type { RoomIndex } from '../../../src/adapters/assets/schemas.ts';
import { CompletionState } from '../../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { OnlineStatus, type OnlineState } from '../../../src/services/online/OnlineClient.ts';
import { OnlineEnd } from '../../../src/services/online/OnlineGameSession.ts';
import { joinList, menuStatus, optionsSummary, roomIdForLevel, roomPanel } from '../../../src/ui/screens/online/lobbyModel.ts';
import { editName, NameEntryOutcome } from '../../../src/ui/screens/online/nameEntry.ts';
import { lobby, OPTIONS } from '../../services/online/support.ts';

const ROOMS: RoomIndex = {
  formatVersion: 1,
  rooms: [{ index: 0, id: 'ROOM_Single_0001', file: 'a.json', name: 'BOXY', iconFrame: 0, exclusive: { single: false, coop: false, deathMatch: false } }],
};

const ONLINE: OnlineState = { status: OnlineStatus.Online, clientId: 'c2', lobbies: [], lobby: undefined, error: undefined, leftReason: undefined, result: undefined };

const SLOTS = 14;

import { clampPage, pageCount, visibleMemberIndices } from '../../../src/ui/screens/online/lobbyModel.ts';

describe('join list pages', () => {
  it('splits hundreds of games into pages of the slot count and clamps the page', () => {
    expect(pageCount(0, 14)).toBe(1);
    expect(pageCount(14, 14)).toBe(1);
    expect(pageCount(300, 14)).toBe(22);
    expect(clampPage(-1, 3)).toBe(0);
    expect(clampPage(5, 3)).toBe(2);
  });

  it('shows the requested page and says which page it is', () => {
    const lobbies = Array.from({ length: 30 }, (_unused, index) => ({ id: `l${index}`, name: `G${index}`, mode: GameMode.Coop, roomId: 'ROOM_Single_0001', state: 'waiting' as const, players: 1, maxPlayers: 16 }));
    const list = joinList(GameMode.Coop, { ...ONLINE, lobbies }, undefined, 14, 2);
    expect(list.rows.map((row) => row.lobbyId)).toEqual(['l28', 'l29']);
    expect(list.info).toBe('Page 3 of 3. Click JOIN next to a game.');
    expect(joinList(GameMode.Coop, { ...ONLINE, lobbies: lobbies.slice(0, 3) }, undefined, 14, 2).page).toBe(0);
  });
});

describe('lobby member list', () => {
  it('shows everyone up to the line limit, else the first players, your own line and a +N MORE line', () => {
    expect(visibleMemberIndices(3, 2, 12)).toEqual({ shown: [0, 1, 2], hidden: 0 });
    expect(visibleMemberIndices(16, 3, 12)).toEqual({ shown: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hidden: 5 });
    expect(visibleMemberIndices(16, 15, 12)).toEqual({ shown: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15], hidden: 5 });
  });
});

describe('online menu and join list', () => {
  it('lists the games of the mode as "<NAME>" rows with "JOIN n/max", "FULL n/max" or JOINING', () => {
    const state: OnlineState = {
      ...ONLINE,
      lobbies: [
        { id: 'l1', name: "Ann's game", mode: GameMode.Coop, roomId: 'ROOM_Single_0001', state: 'waiting', players: 2, maxPlayers: 4 },
        { id: 'l2', name: 'Full', mode: GameMode.Coop, roomId: 'ROOM_Single_0001', state: 'playing', players: 4, maxPlayers: 4 },
        { id: 'l3', name: 'Other mode', mode: GameMode.DeathMatch, roomId: 'ROOM_Single_0001', state: 'waiting', players: 1, maxPlayers: 4 },
        { id: 'l4', name: 'Running', mode: GameMode.Coop, roomId: 'ROOM_Single_0001', state: 'playing', players: 1, maxPlayers: 4 },
      ],
    };
    const list = joinList(GameMode.Coop, state, undefined, SLOTS);
    expect(list.rows).toEqual([
      { lobbyId: 'l1', label: "ANN'S GAME", action: 'JOIN 2/4', joinable: true, running: false },
      { lobbyId: 'l2', label: 'FULL', action: 'FULL 4/4', joinable: false, running: true },
      { lobbyId: 'l4', label: 'RUNNING', action: 'JOIN 1/4', joinable: true, running: true },
    ]);
    const joining = joinList(GameMode.Coop, state, 'l1', SLOTS);
    expect(joining.rows.map((row) => [row.action, row.joinable])).toEqual([
      ['JOINING…', false],
      ['FULL 4/4', false],
      ['JOIN 1/4', false],
    ]);
    expect(joinList(GameMode.Coop, state, undefined, 1).rows).toHaveLength(1);
    expect(menuStatus(GameMode.Coop, state, undefined)).toBe('COOPERATIVE ONLINE · Open games: 3');
  });

  it('explains an empty list, the connection state and errors', () => {
    expect(joinList(GameMode.Coop, ONLINE, undefined, SLOTS).info).toBe('No games yet. Close this window and HOST one.');
    const connecting = { ...ONLINE, status: OnlineStatus.Connecting };
    expect(joinList(GameMode.Coop, connecting, undefined, SLOTS).info).toBe('Connecting to the game server…');
    expect(menuStatus(GameMode.Coop, connecting, undefined)).toBe('Connecting to the game server…');
    expect(joinList(GameMode.Coop, { ...ONLINE, error: 'lobbyFull' }, undefined, SLOTS).info).toBe('That game is full.');
  });

  it('edits the name with typed characters, backspace, a length limit, Enter and Escape', () => {
    let step = editName('', 'KeyA', 'A', 3);
    step = editName(step.draft, 'KeyN', 'n', 3);
    step = editName(step.draft, 'KeyN', 'n', 3);
    expect(editName(step.draft, 'KeyX', 'x', 3)).toEqual({ draft: 'Ann', outcome: NameEntryOutcome.Editing });
    expect(editName('Ann', 'Backspace', undefined, 3).draft).toBe('An');
    expect(editName('Ann', 'ShiftLeft', undefined, 3).draft).toBe('Ann');
    expect(editName(' Ann ', 'Enter', undefined, 16)).toEqual({ draft: 'Ann', outcome: NameEntryOutcome.Confirmed });
    expect(editName('Ann', 'Escape', undefined, 16).outcome).toBe(NameEntryOutcome.Cancelled);
  });
});

describe('lobby room on the select-world screen', () => {
  it('shows the host the start prompt and the guest the waiting prompt, with the player list', () => {
    const host = roomPanel(lobby(), { ...ONLINE, clientId: 'c1' }, ROOMS, undefined);
    expect(host).toMatchObject({ host: true, levelIndex: 0, prompt: 'CLICK TO START GAME', canPlay: true });
    expect(host.members).toEqual(['LOBBY CODE: ABCDE', 'PLAYERS: 2/4', '1. ANN · BAMBO (you, host)', '2. BOB · SWAT']);
    const guest = roomPanel(lobby(), ONLINE, ROOMS, undefined);
    expect(guest).toMatchObject({ host: false, prompt: 'WAITING FOR ANN TO START', canPlay: false });
    expect(guest.options).toBe('Beginner · Normal speed · Devils on · Collisions on · Friendly fire on');
  });

  it('offers joining a running match to a member outside it', () => {
    const running = lobby({ state: 'playing', members: [{ id: 'c1', name: 'Ann', character: 3, host: true, connected: false, playerIndex: 0 }, { id: 'c2', name: 'Bob', character: 0, host: false, connected: true, playerIndex: null }] });
    const outside = roomPanel(running, ONLINE, ROOMS, undefined);
    expect(outside).toMatchObject({ prompt: 'CLICK TO JOIN GAME', canPlay: true });
    expect(outside.members[2]).toBe('1. ANN · BAMBO (host, in game, offline)');
    const inside = roomPanel(running, { ...ONLINE, clientId: 'c1' }, ROOMS, undefined);
    expect(inside).toMatchObject({ prompt: 'GAME RUNNING', canPlay: false });
  });

  it('explains errors and results', () => {
    expect(roomPanel(lobby(), { ...ONLINE, error: 'notHost' }, ROOMS, undefined).notice).toBe('Only the host can do that.');
    const won = { end: OnlineEnd.Finished, state: CompletionState.PlayerWon, gameOver: { type: 'gameOver', matchId: 'm', state: CompletionState.PlayerWon, winnerName: 'Bob', score: 0 } } as const;
    expect(roomPanel(lobby(), ONLINE, ROOMS, won).notice).toBe('Bob wins!');
    const dead = { end: OnlineEnd.Finished, state: CompletionState.PlayerDead, gameOver: { type: 'gameOver', matchId: 'm', state: CompletionState.PlayerDead, winnerName: null, score: 1234 } } as const;
    expect(menuStatus(GameMode.Coop, ONLINE, dead)).toBe('Game over! Score 1234');
    expect(roomIdForLevel(ROOMS, 0)).toBe('ROOM_Single_0001');
    expect(roomIdForLevel(ROOMS, 5)).toBeUndefined();
  });

  it('summarizes options per mode', () => {
    expect(optionsSummary(GameMode.Coop, OPTIONS)).toBe('Beginner · Normal speed · Devils on · Collisions on · Friendly fire on');
    expect(optionsSummary(GameMode.DeathMatch, OPTIONS)).toBe('First to 10 kills · Normal speed · Collisions on');
  });
});
