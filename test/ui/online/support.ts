import { ASSET_FORMAT_VERSION, type RoomIndex, type SymbolsCatalog } from '../../../src/adapters/assets/schemas.ts';
import { SymbolLibrary } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { MemoryStore } from '../../../src/adapters/storage/KeyValueStore.ts';
import type { GameMode } from '../../../src/domain/world/GameMode.ts';
import type { GameStarted, OnlineMode } from '../../../src/net/protocol.ts';
import { silentLogger } from '../../../src/observability/logger.ts';
import type { InviteView } from '../../../src/services/online/LobbyInvite.ts';
import { OnlineClient } from '../../../src/services/online/OnlineClient.ts';
import type { OnlineSessionResult } from '../../../src/services/online/OnlineGameSession.ts';
import type { FlowControls, GameSelection } from '../../../src/services/ScreenFlow.ts';
import type { SessionResult } from '../../../src/services/GameSession.ts';
import { SettingsService } from '../../../src/services/SettingsService.ts';
import type { MenuKit } from '../../../src/ui/screens/menu/MenuCore.ts';
import { MenuSymbol } from '../../../src/ui/screens/menu/tuning.ts';
import { FakeTransport } from '../../services/online/support.ts';

export const LEVELS = 3;
const LEVEL_ICONS_ID = 1;

export const ROOMS: RoomIndex = {
  formatVersion: ASSET_FORMAT_VERSION,
  rooms: Array.from({ length: LEVELS }, (_unused, index) => ({
    index,
    id: `ROOM_Single_000${index + 1}`,
    file: `room${index + 1}.json`,
    name: `ROOM ${index + 1}`,
    iconFrame: index,
    exclusive: { single: false, coop: false, deathMatch: false },
  })),
};

function emptySprite(frames: number) {
  return { frameCount: frames, frames: Array.from({ length: frames }, () => []), frameBounds: Array.from({ length: frames }, () => null) };
}

const CATALOG: SymbolsCatalog = {
  formatVersion: ASSET_FORMAT_VERSION,
  stage: { width: 640, height: 480, frameRate: 25 },
  exports: { [MenuSymbol.LevelIcons]: LEVEL_ICONS_ID },
  classes: {},
  shapes: {},
  morphShapes: {},
  texts: {},
  editTexts: {},
  buttons: {},
  sprites: { [String(LEVEL_ICONS_ID)]: emptySprite(LEVELS) },
  root: emptySprite(1),
};

export function fakeMenuKit(): MenuKit {
  const kit = {
    shell: { canvas: { width: 1, height: 1 }, hideOverlay: () => undefined },
    renderer: { library: new SymbolLibrary(CATALOG), createSurface: () => ({ ctx: { drawImage: () => undefined } }) },
    stage: {},
    audio: { play: () => undefined },
  };
  return kit as unknown as MenuKit;
}

export class RecordingControls implements FlowControls {
  readonly calls: string[] = [];

  showMainMenu(): void {
    this.calls.push('mainMenu');
  }

  selectWorld(mode: GameMode): void {
    this.calls.push(`selectWorld:${mode}`);
  }

  startGame(selection: GameSelection): void {
    this.calls.push(`startGame:${selection.roomId}`);
  }

  finishGame(result: SessionResult): void {
    this.calls.push(`finishGame:${result.state}`);
  }

  openLobby(mode: OnlineMode, result?: OnlineSessionResult): void {
    this.calls.push(`openLobby:${mode}${result ? `:${result.end}` : ''}`);
  }

  enterLobby(mode: OnlineMode): void {
    this.calls.push(`enterLobby:${mode}`);
  }

  joinByCode(code: string): void {
    this.calls.push(`joinByCode:${code}`);
  }

  startOnlineGame(start: GameStarted): void {
    this.calls.push(`startOnlineGame:${start.matchId}`);
  }

  finishOnlineGame(result: OnlineSessionResult, inLobby: boolean): void {
    this.calls.push(`finishOnlineGame:${result.end}:${inLobby}`);
  }
}

export const FAKE_INVITE: InviteView = { code: undefined, copied: false, copy: () => undefined, forget: () => undefined };

export function onlineSetup(clientId = 'c1') {
  const transport = new FakeTransport();
  const client = new OnlineClient({ session: new MemoryStore(), name: () => 'Ann', logger: silentLogger, onGameStarted: () => undefined, now: () => 0 });
  client.bind(transport);
  client.start();
  client.opened();
  client.receive({ type: 'welcome', clientId, sessionId: 's', resumed: false });
  const settings = new SettingsService(new MemoryStore(), silentLogger);
  return { client, transport, settings, controls: new RecordingControls() };
}
