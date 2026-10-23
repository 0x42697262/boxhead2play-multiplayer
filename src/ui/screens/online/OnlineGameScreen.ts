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
import type { Logger } from '../../../observability/logger.ts';
import type { OnlineClient } from '../../../services/online/OnlineClient.ts';
import { OnlineGameSession } from '../../../services/online/OnlineGameSession.ts';
import { Cursor, PointerPhase, type FlowControls, type PointerInput, type Screen } from '../../../services/ScreenFlow.ts';
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
}

export function playerNames(client: OnlineClient): HudFrame['playerNames'] {
  const names: Record<number, string> = {};
  for (const member of client.lobby?.members ?? []) if (member.playerIndex !== null) names[member.playerIndex] = member.name;
  return names;
}

export class OnlineGameScreen implements Screen {
  readonly name = 'onlineGame';
  readonly cursor = Cursor.Default;
  private readonly renderer: WorldRenderer;
  private readonly session: OnlineGameSession;

  constructor(private readonly deps: OnlineGameScreenDependencies) {
    const { start, client, keyboard } = deps;
    const room = deps.catalogs.rooms.get(start.roomId);
    if (!room) throw new AppError(ErrorCode.RoomUnknown, start.roomId);
    const hud = new HudRenderer(deps.kit.renderer, start.mode);
    this.renderer = new WorldRenderer(room, deps.kit.renderer, deps.kit.clips, deps.kit.painter, hud, { detail: start.options.detail });
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
      logger: deps.logger,
      onFinished: (result) => deps.controls.finishOnlineGame(result),
    });
    deps.shell.hideOverlay();
  }

  get ticksPerSecond(): number {
    return this.session.ticksPerSecond;
  }

  tick(): void {
    this.session.tick();
  }

  present(): void {
    const { stage } = this.deps.kit;
    this.renderer.composite(stage.ctx);
    const ctx = this.deps.shell.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(stage.canvas, 0, 0);
  }

  idle(hasTime: () => boolean): void {
    this.deps.kit.characters.prewarm(hasTime);
  }

  pointer(input: PointerInput): void {
    if (input.phase !== PointerPhase.Down) return;
    if (this.renderer.hud.hitTest(input.point) === HudAction.Quit) this.session.requestQuit();
  }

  key(): boolean {
    return false;
  }

  suspend(): void {
    this.session.releaseControls();
  }

  dispose(): void {
    this.session.dispose();
    this.deps.audio.stopAll();
  }
}
