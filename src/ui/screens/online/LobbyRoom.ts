import type { RoomIndex } from '../../../adapters/assets/schemas.ts';
import type { PlayerCharacter } from '../../../domain/world/SimulationSettings.ts';
import type { OnlineMode } from '../../../net/protocol.ts';
import type { InviteView } from '../../../services/online/LobbyInvite.ts';
import type { OnlineClient } from '../../../services/online/OnlineClient.ts';
import type { OnlineSessionResult } from '../../../services/online/OnlineGameSession.ts';
import type { FlowControls } from '../../../services/ScreenFlow.ts';
import { toLobbyOptions, type SettingsService } from '../../../services/SettingsService.ts';
import { roomPanel, type RoomPanel } from './lobbyModel.ts';

export interface SelectWorldRoom {
  panel(): RoomPanel | undefined;
  play(): void;
  back(): void;
  configChanged(roomId: string): void;
  copyLink(): void;
  characterChanged(character: PlayerCharacter): void;
  dispose(): void;
}

export interface LobbyRoomDependencies {
  readonly client: OnlineClient;
  readonly settings: SettingsService;
  readonly rooms: RoomIndex;
  readonly controls: FlowControls;
  readonly mode: OnlineMode;
  readonly result: OnlineSessionResult | undefined;
  readonly invite: InviteView;
}

export class LobbyRoom implements SelectWorldRoom {
  private readonly unsubscribe: () => void;
  private result: OnlineSessionResult | undefined;
  private left = false;

  constructor(private readonly deps: LobbyRoomDependencies) {
    this.result = deps.result;
    deps.invite.forget();
    this.unsubscribe = deps.client.subscribe(() => this.leaveWhenGone());
    this.leaveWhenGone();
  }

  panel(): RoomPanel | undefined {
    const { client, rooms } = this.deps;
    return client.lobby ? roomPanel(client.lobby, client.state, rooms, this.result, this.deps.invite.copied) : undefined;
  }

  play(): void {
    if (!this.panel()?.canPlay) return;
    this.result = undefined;
    this.deps.client.clearNotice();
    this.deps.client.play();
  }

  back(): void {
    this.left = true;
    this.deps.client.leaveLobby();
    this.deps.controls.openLobby(this.deps.mode);
  }

  configChanged(roomId: string): void {
    if (!this.panel()?.host) return;
    this.deps.client.configure(roomId, toLobbyOptions(this.deps.settings.settings));
  }

  copyLink(): void {
    this.deps.invite.copy();
  }

  characterChanged(character: PlayerCharacter): void {
    this.deps.client.setCharacter(character);
  }

  dispose(): void {
    this.unsubscribe();
  }

  private leaveWhenGone(): void {
    if (this.left || this.deps.client.lobby) return;
    this.left = true;
    this.deps.controls.openLobby(this.deps.mode);
  }
}
