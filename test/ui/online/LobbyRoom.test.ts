import { describe, expect, it } from 'vitest';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { LobbyRoom } from '../../../src/ui/screens/online/LobbyRoom.ts';
import { lobby, OPTIONS } from '../../services/online/support.ts';
import { FAKE_INVITE, onlineSetup, ROOMS } from './support.ts';

function room(withLobby = true) {
  const setup = onlineSetup();
  if (withLobby) setup.client.receive({ type: 'lobby', lobby: lobby() });
  const lobbyRoom = new LobbyRoom({ client: setup.client, rooms: ROOMS, controls: setup.controls, mode: GameMode.Coop, result: undefined, invite: FAKE_INVITE });
  return { ...setup, room: lobbyRoom };
}

describe('LobbyRoom', () => {
  it('returns to the online menu once when the lobby is gone', () => {
    const { client, controls } = room();
    client.receive({ type: 'lobbyLeft', reason: 'closed' });
    client.receive({ type: 'lobbies', lobbies: [] });
    expect(controls.calls).toEqual(['openLobby:coop']);
    expect(room(false).controls.calls).toEqual(['openLobby:coop']);
  });

  it('leaves the lobby on back and does not navigate again when the server confirms', () => {
    const { room: lobbyRoom, client, controls, transport } = room();
    lobbyRoom.back();
    client.receive({ type: 'lobbyLeft', reason: 'left' });
    expect(transport.types().at(-1)).toBe('leaveLobby');
    expect(controls.calls).toEqual(['openLobby:coop']);
  });

  it('configures only while the host waits for players', () => {
    const { room: lobbyRoom, client, transport } = room();
    lobbyRoom.configure('ROOM_Single_0002', OPTIONS);
    expect(transport.sent.at(-1)).toEqual({ type: 'configureLobby', roomId: 'ROOM_Single_0002', options: OPTIONS });
    client.receive({ type: 'lobby', lobby: lobby({ state: 'playing' }) });
    expect(lobbyRoom.panel()?.configurable).toBe(false);
    lobbyRoom.configure('ROOM_Single_0003', OPTIONS);
    expect(transport.types().filter((type) => type === 'configureLobby')).toHaveLength(1);
  });
});
