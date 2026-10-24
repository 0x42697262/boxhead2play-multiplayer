import { effectPreferences } from '../../../services/menuSettings.ts';
import type { GameCatalogs } from '../../../adapters/assets/AssetLoader.ts';
import type { SoundMixer } from '../../../adapters/audio/SoundMixer.ts';
import type { KeyboardState } from '../../../adapters/input/KeyboardState.ts';
import { buildBindings, TickInputSampler } from '../../../adapters/input/TickInputSampler.ts';
import { HudAction, HudRenderer } from '../../../adapters/render/hud/HudRenderer.ts';
import type { HudFrame } from '../../../adapters/render/world/WorldFrame.ts';
import { WorldRenderer } from '../../../adapters/render/world/WorldRenderer.ts';
import { prewarmCollections } from '../../../adapters/render/xsi/collections.ts';
import { masksOf } from '../../../net/controlMask.ts';
import { gameOptionsFor, type GameStarted } from '../../../net/protocol.ts';
import { MAX_LOBBY_PLAYERS } from '../../../net/tuning.ts';
import { playerListView, type PlayerListView } from '../../../services/online/playerList.ts';
import type { Logger } from '../../../observability/logger.ts';
import type { Rng } from '../../../domain/math/Rng.ts';
import { GameMenu } from '../gameMenu/GameMenu.ts';
import type { InviteView } from '../../../services/online/LobbyInvite.ts';
import type { OnlineClient } from '../../../services/online/OnlineClient.ts';
import { OnlineGameSession } from '../../../services/online/OnlineGameSession.ts';
import type { Cursor} from '../../../services/ScreenFlow.ts';
import { PointerPhase, Simulation, TouchLayout, type FlowControls, type PointerInput, type Screen } from '../../../services/ScreenFlow.ts';
import type { SettingsService } from '../../../services/SettingsService.ts';
import { AppError, ErrorCode } from '../../../text/errors.ts';
import type { Shell } from '../../shell/Shell.ts';
import type { RenderKit } from '../GameScreen.ts';

export interface OnlineGameScreenDependencies {
  readonly shell: Shell;
  readonly kit: RenderKit;
  readonly catalogs: GameCatalogs;
  readonly settings: SettingsService;
  readonly audio: SoundMixer;
  readonly keyboard: KeyboardState;
  readonly client: OnlineClient;
  readonly logger: Logger;
  readonly controls: FlowControls;
  readonly start: GameStarted;
  readonly uiRng: Rng;
  readonly invite: InviteView;
}

export function playerNames(client: OnlineClient): HudFrame['playerNames'] {
  const names: Record<number, string> = {};
  for (const member of client.lobby?.members ?? []) if (member.playerIndex !== null) names[member.playerIndex] = member.name;
  return names;
}

export class OnlineGameScreen implements Screen {
  readonly name = 'onlineGame';
  readonly simulation = Simulation.Shared;
  private readonly menu: GameMenu;
  private readonly renderer: WorldRenderer;
  private readonly session: OnlineGameSession;

  constructor(private readonly deps: OnlineGameScreenDependencies) {
    const { start, client, keyboard } = deps;
    const room = deps.catalogs.rooms.get(start.roomId);
    if (!room) throw new AppError(ErrorCode.RoomUnknown, start.roomId);
    const hud = new HudRenderer(deps.kit.renderer, start.mode);
    this.renderer = new WorldRenderer(room, deps.kit.renderer, deps.kit.clips, deps.kit.painter, hud, { detail: start.options.detail, resolution: () => deps.shell.resolution, effects: () => effectPreferences(deps.settings.settings) });
    const characters = (client.lobby?.members ?? []).map((member) => member.character);
    for (const collection of prewarmCollections(gameOptionsFor(start.mode, start.options, characters))) deps.kit.characters.enqueue(collection);
    keyboard.releaseAll();
    keyboard.clearEdges();
    const sampler = new TickInputSampler(buildBindings(deps.settings.settings.keys));
    this.session = new OnlineGameSession({
      start,
      audio: deps.audio,
      scene: this.renderer,
      input: {
        sample: () => {
          const masks = masksOf(sampler.player(keyboard));
          const upgradeListPressed = sampler.upgradeListPressed(keyboard);
          keyboard.clearEdges();
          return { masks, upgradeListPressed };
        },
      },
      link: client,
      playerNames: () => playerNames(client),
      showPing: () => deps.settings.settings.showPing,
      logger: deps.logger,
      onFinished: (result) => deps.controls.finishOnlineGame(result, client.lobby !== undefined),
    });
    this.menu = new GameMenu({ shell: deps.shell, renderer: deps.kit.renderer, audio: deps.audio, settings: deps.settings, rng: deps.uiRng, quit: () => this.session.requestQuit(), invite: deps.invite });
    deps.shell.hideOverlay();
  }

  get cursor(): Cursor {
    return this.menu.cursor;
  }

  get touchLayout(): TouchLayout {
    return this.menu.open ? TouchLayout.Menu : TouchLayout.Play;
  }

  get ticksPerSecond(): number {
    return this.session.ticksPerSecond;
  }

  get playerList(): PlayerListView {
    const { client, start } = this.deps;
    const lobby = client.lobby;
    return playerListView({
      members: lobby?.members ?? [],
      capacity: lobby?.maxPlayers ?? MAX_LOBBY_PLAYERS,
      players: this.session.players,
      localPlayerIndex: start.playerIndex,
      latencyOf: (playerIndex) => (playerIndex === start.playerIndex ? client.latencyMs() : client.latencyOf(playerIndex)),
      ticksPerSecond: this.session.ticksPerSecond,
    });
  }

  tick(): void {
    this.session.tick();
    this.menu.tick();
  }

  present(): void {
    this.session.pollInput();
    const composed = this.renderer.composite();
    const { ctx, canvas } = this.deps.shell;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(composed.canvas, 0, 0, canvas.width, canvas.height);
    this.menu.present();
  }

  idle(hasTime: () => boolean): void {
    this.deps.kit.characters.prewarm(hasTime);
  }

  pointer(input: PointerInput): void {
    if (this.menu.open) {
      this.menu.pointer(input);
      return;
    }
    if (input.phase !== PointerPhase.Down) return;
    if (this.renderer.hud.hitTest(input.point) === HudAction.Quit) this.session.requestQuit();
  }

  key(code: string): boolean {
    return this.menu.key(code);
  }

  suspend(): void {
    this.session.releaseControls();
  }

  dispose(): void {
    this.session.dispose();
    this.deps.audio.stopAll();
  }
}
