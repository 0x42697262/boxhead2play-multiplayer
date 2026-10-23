import type { RoomIndex } from '../../../adapters/assets/schemas.ts';
import type { StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import { SoundId } from '../../../domain/sounds.ts';
import type { PlayerCharacter } from '../../../domain/world/SimulationSettings.ts';
import { withCharacter, withPlayerName } from '../../../services/menuSettings.ts';
import type { OnlineClient } from '../../../services/online/OnlineClient.ts';
import type { Cursor, FlowControls, LobbyEntry, Screen } from '../../../services/ScreenFlow.ts';
import { toLobbyOptions, type SettingsService } from '../../../services/SettingsService.ts';
import { mainMenuBackdrop } from '../menu/MainMenuScreen.ts';
import { MenuCore, type MenuKit } from '../menu/MenuCore.ts';
import { MENU_TICKS_PER_SECOND } from '../menu/tuning.ts';
import { LobbyCommand, lobbyViewModel } from './lobbyModel.ts';
import { LobbyView } from './LobbyView.ts';

export interface LobbyScreenDependencies {
  readonly kit: MenuKit;
  readonly document: Document;
  readonly client: OnlineClient;
  readonly settings: SettingsService;
  readonly rooms: RoomIndex;
  readonly controls: FlowControls;
  readonly entry: LobbyEntry;
}

const NO_TARGETS: readonly never[] = [];

export class LobbyScreen implements Screen {
  readonly name = 'lobby';
  readonly ticksPerSecond = MENU_TICKS_PER_SECOND;
  private readonly core: MenuCore<never>;
  private readonly view: LobbyView;
  private readonly backdrop: StageScene;
  private readonly unsubscribe: () => void;
  private result: LobbyEntry['result'];

  constructor(private readonly deps: LobbyScreenDependencies) {
    this.core = new MenuCore(deps.kit);
    this.backdrop = { items: mainMenuBackdrop(deps.kit.renderer.library), overrides: {}, expand: new Set() };
    this.result = deps.entry.result;
    const { client, settings, entry } = deps;
    this.view = new LobbyView(deps.document, settings.settings.playerName, {
      command: (command) => this.command(command),
      join: (lobbyId) => this.join(lobbyId),
      rename: (name) => this.rename(name),
      character: (character) => this.character(character),
    });
    client.clearNotice();
    this.unsubscribe = client.subscribe(() => this.render());
    client.start();
    client.watch(entry.mode);
    if (entry.host) this.host(entry.host.roomId);
    this.render();
    deps.kit.shell.showPanel(this.view.root);
  }

  get cursor(): Cursor {
    return this.core.cursor;
  }

  tick(): void {
    this.core.tick(
      () => this.backdrop,
      () => NO_TARGETS,
    );
  }

  present(): void {
    this.core.present(this.backdrop);
  }

  idle(): void {}

  pointer(): void {}

  key(): boolean {
    return false;
  }

  suspend(): void {}

  dispose(): void {
    this.unsubscribe();
    this.deps.kit.shell.hideOverlay();
  }

  private host(roomId: string): void {
    const { client, settings, entry } = this.deps;
    const options = toLobbyOptions(settings.settings);
    if (client.lobby && client.isHost) client.configure(roomId, options);
    else client.createLobby(entry.mode, roomId, options, settings.settings.character);
  }

  private render(): void {
    const { client, settings, rooms, entry } = this.deps;
    this.view.update(lobbyViewModel({ mode: entry.mode, state: client.state, rooms, character: settings.settings.character, result: this.result }));
  }

  private command(command: LobbyCommand): void {
    const { client, controls, entry, kit } = this.deps;
    kit.audio.play(SoundId.Click);
    this.result = undefined;
    client.clearNotice();
    switch (command) {
      case LobbyCommand.Host:
      case LobbyCommand.ChangeLevel:
        controls.selectWorld(entry.mode);
        return;
      case LobbyCommand.Back:
        client.stop();
        controls.showMainMenu();
        return;
      case LobbyCommand.Start:
      case LobbyCommand.JoinGame:
        client.play();
        return;
      case LobbyCommand.Leave:
        client.leaveLobby();
        return;
    }
  }

  private join(lobbyId: string): void {
    this.deps.kit.audio.play(SoundId.Click);
    this.result = undefined;
    this.deps.client.clearNotice();
    this.deps.client.joinLobby(lobbyId, this.deps.settings.settings.character);
  }

  private rename(name: string): void {
    const updated = this.deps.settings.update((settings) => withPlayerName(settings, name));
    this.deps.client.rename(updated.playerName);
  }

  private character(character: PlayerCharacter): void {
    this.deps.kit.audio.play(SoundId.Click2);
    this.deps.settings.update((settings) => withCharacter(settings, character));
    this.deps.client.setCharacter(character);
    this.render();
  }
}
