import { describe, expect, it } from 'vitest';
import { Difficulty } from '../../../src/domain/world/SimulationSettings.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import type { LobbyDto } from '../../../src/net/protocol.ts';
import { SeededRng } from '../../../src/domain/math/Rng.ts';
import { silentLogger } from '../../../src/observability/logger.ts';
import { OptionField } from '../../../src/services/menuSettings.ts';
import { levelIndexFor, withLevelIndex } from '../../../src/services/SettingsService.ts';
import { SelectAction, SelectWorldScreen } from '../../../src/ui/screens/menu/SelectWorldScreen.ts';
import { LobbyRoom } from '../../../src/ui/screens/online/LobbyRoom.ts';
import { lobby, OPTIONS } from '../../services/online/support.ts';
import { FAKE_INVITE, fakeMenuKit, onlineSetup, ROOMS } from '../online/support.ts';

const MIGRATED_MEMBERS: LobbyDto['members'] = [
  { id: 'c1', name: 'Ann', character: 3, host: false, connected: false, playerIndex: null },
  { id: 'c2', name: 'Bob', character: 0, host: true, connected: true, playerIndex: null },
];

function lobbyRoomScreen() {
  const setup = onlineSetup('c2');
  setup.settings.update((settings) => withLevelIndex(settings, GameMode.Coop, 0));
  setup.client.receive({ type: 'lobby', lobby: lobby({ roomId: 'ROOM_Single_0002', options: { ...OPTIONS, difficulty: Difficulty.Expert }, members: MIGRATED_MEMBERS }) });
  const room = new LobbyRoom({ client: setup.client, rooms: ROOMS, controls: setup.controls, mode: GameMode.Coop, result: undefined, invite: FAKE_INVITE });
  const screen = new SelectWorldScreen({ kit: fakeMenuKit(), settings: setup.settings, rooms: ROOMS, controls: setup.controls, logger: silentLogger, rng: new SeededRng(1), mode: GameMode.Coop, room });
  return { ...setup, screen };
}

describe('SelectWorldScreen in a lobby room', () => {
  it('renames the player from the room: type, Enter saves and tells the server, Esc cancels', () => {
    const { screen, transport, settings } = lobbyRoomScreen();
    expect(screen.textEntry).toBeUndefined();
    screen.perform({ kind: SelectAction.EditName });
    expect(screen.textEntry).toEqual({ kind: 'name', draft: '', maxLength: 16 });
    for (const typed of 'Sam') screen.key('', typed);
    expect(screen.key('Enter')).toBe(true);
    expect(settings.settings.playerName).toBe('Sam');
    expect(transport.sent.filter((message) => message.type === 'setName')).toEqual([{ type: 'setName', name: 'Sam' }]);
    screen.perform({ kind: SelectAction.EditName });
    screen.key('', 'x');
    screen.key('Escape');
    expect(screen.textEntry).toBeUndefined();
    expect(settings.settings.playerName).toBe('Sam');
  });

  it('saves a name being typed when another control is clicked', () => {
    const { screen, settings } = lobbyRoomScreen();
    screen.perform({ kind: SelectAction.EditName });
    screen.key('', 'B');
    screen.perform({ kind: SelectAction.OpenControls });
    expect(settings.settings.playerName).toBe('B');
    expect(screen.textEntry).toBeUndefined();
  });

  it('shows the lobby level and options to a host who took over, and steps from them', () => {
    const { screen, transport, settings } = lobbyRoomScreen();
    expect(screen.levelIndex).toBe(1);
    expect(screen.shownOptions.difficulty).toBe(Difficulty.Expert);
    screen.perform({ kind: SelectAction.Level, delta: 1 });
    expect(transport.sent.at(-1)).toEqual({ type: 'configureLobby', roomId: 'ROOM_Single_0003', options: { ...OPTIONS, difficulty: Difficulty.Expert } });
    expect(levelIndexFor(settings.settings, GameMode.Coop)).toBe(2);
  });

  it('changes one option of the lobby options, not the local ones', () => {
    const { screen, transport } = lobbyRoomScreen();
    screen.perform({ kind: SelectAction.Option, field: OptionField.Devils, value: 0 });
    expect(transport.sent.at(-1)).toEqual({ type: 'configureLobby', roomId: 'ROOM_Single_0002', options: { ...OPTIONS, difficulty: Difficulty.Expert, devilsActive: false } });
  });

  it('keeps level and options locked while the match runs, without touching the saved settings', () => {
    const { screen, transport, client, settings } = lobbyRoomScreen();
    client.receive({ type: 'lobby', lobby: lobby({ state: 'playing', roomId: 'ROOM_Single_0002', members: MIGRATED_MEMBERS }) });
    const before = settings.settings;
    screen.perform({ kind: SelectAction.Level, delta: 1 });
    screen.perform({ kind: SelectAction.Option, field: OptionField.Devils, value: 0 });
    screen.perform({ kind: SelectAction.ResetOptions });
    expect(screen.configurable).toBe(false);
    expect(transport.types()).not.toContain('configureLobby');
    expect(settings.settings).toBe(before);
  });
});
