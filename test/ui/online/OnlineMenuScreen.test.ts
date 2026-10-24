import { describe, expect, it } from 'vitest';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { LobbyState, type LobbyDto } from '../../../src/net/protocol.ts';
import type { JoinRow } from '../../../src/ui/screens/online/lobbyModel.ts';
import { LobbyRoom } from '../../../src/ui/screens/online/LobbyRoom.ts';
import { OnlineMenuAction, OnlineMenuScreen } from '../../../src/ui/screens/online/OnlineMenuScreen.ts';
import { lobby } from '../../services/online/support.ts';
import { FAKE_INVITE, fakeMenuKit, onlineSetup, ROOMS } from './support.ts';

function menu(setup = onlineSetup(), joinCode?: string) {
  const entry = joinCode === undefined ? { mode: GameMode.Coop, result: undefined } : { mode: GameMode.Coop, result: undefined, joinCode };
  const screen = new OnlineMenuScreen({ kit: fakeMenuKit(), rng: { next: () => 0, int: () => 0 }, client: setup.client, settings: setup.settings, rooms: ROOMS, controls: setup.controls, entry });
  return { ...setup, screen };
}

function row(lobbyId: string, running = false): JoinRow {
  return { lobbyId, label: lobbyId, action: '', joinable: true, running };
}

describe('OnlineMenuScreen lobby requests', () => {
  it('sends one createLobby for a double HOST and enters the lobby room on the reply', () => {
    const { screen, transport, client, controls } = menu();
    screen.perform({ kind: OnlineMenuAction.Host });
    screen.perform({ kind: OnlineMenuAction.Host });
    expect(transport.types().filter((type) => type === 'createLobby')).toHaveLength(1);
    client.receive({ type: 'lobby', lobby: lobby() });
    expect(controls.calls).toEqual(['enterLobby:coop']);
    expect(screen.waitingForLobby).toBe(false);
  });

  it('ignores HOST and other rows while a join is pending, and still enters the lobby after the window closes', () => {
    const { screen, transport, client, controls } = menu();
    screen.perform({ kind: OnlineMenuAction.OpenJoin });
    screen.perform({ kind: OnlineMenuAction.Join, row: row('l1') });
    screen.perform({ kind: OnlineMenuAction.Join, row: row('l2') });
    screen.perform({ kind: OnlineMenuAction.CloseJoin });
    screen.perform({ kind: OnlineMenuAction.Host });
    expect(transport.types().filter((type) => type === 'joinLobby' || type === 'createLobby')).toEqual(['joinLobby']);
    expect(screen.joinWindowOpen).toBe(false);
    client.receive({ type: 'lobby', lobby: lobby({ members: [{ id: 'c2', name: 'Bob', character: 0, host: true, connected: true, playerIndex: null }, { id: 'c1', name: 'Ann', character: 3, host: false, connected: true, playerIndex: null }] }) });
    expect(controls.calls).toEqual(['enterLobby:coop']);
  });

  it('lets the player try again after an error', () => {
    const { screen, transport, client, controls } = menu();
    screen.perform({ kind: OnlineMenuAction.Host });
    client.receive({ type: 'error', reason: 'lobbyLimit' });
    expect(screen.waitingForLobby).toBe(false);
    screen.perform({ kind: OnlineMenuAction.Host });
    expect(transport.types().filter((type) => type === 'createLobby')).toHaveLength(2);
    expect(controls.calls).toEqual([]);
  });

  it('enters a running match after joining it from the list', () => {
    const { screen, transport, client, controls } = menu();
    screen.perform({ kind: OnlineMenuAction.Join, row: row('l1', true) });
    const members: LobbyDto['members'] = [
      { id: 'c2', name: 'Bob', character: 0, host: true, connected: true, playerIndex: 0 },
      { id: 'c1', name: 'Ann', character: 3, host: false, connected: true, playerIndex: null },
    ];
    client.receive({ type: 'lobby', lobby: lobby({ state: LobbyState.Playing, members }) });
    expect(transport.types().at(-1)).toBe('startGame');
    expect(controls.calls).toEqual(['enterLobby:coop']);
  });

  it('joins by code on entry', () => {
    const { transport, client, controls } = menu(onlineSetup(), 'ABCDE');
    expect(transport.sent.at(-1)).toMatchObject({ type: 'joinByCode', code: 'ABCDE' });
    client.receive({ type: 'lobby', lobby: lobby() });
    expect(controls.calls).toEqual(['enterLobby:coop']);
  });
});

describe('back to the online menu, then HOST', () => {
  it('waits for the new lobby instead of re-entering the one being left', () => {
    const setup = onlineSetup();
    setup.client.receive({ type: 'lobby', lobby: lobby() });
    const room = new LobbyRoom({ client: setup.client, rooms: ROOMS, controls: setup.controls, mode: GameMode.Coop, result: undefined, invite: FAKE_INVITE });
    room.back();
    room.dispose();
    const { screen, client, controls } = menu(setup);
    screen.perform({ kind: OnlineMenuAction.Host });
    client.receive({ type: 'lobby', lobby: lobby({ name: 'still the old one' }) });
    client.receive({ type: 'lobbyLeft', reason: 'left' });
    expect(controls.calls).toEqual(['openLobby:coop']);
    client.receive({ type: 'lobby', lobby: lobby({ id: 'l2' }) });
    expect(controls.calls).toEqual(['openLobby:coop', 'enterLobby:coop']);
    expect(client.state.leftReason).toBeUndefined();
  });
});
