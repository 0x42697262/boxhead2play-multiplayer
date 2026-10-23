import type { GameCatalogs } from '../../adapters/assets/AssetLoader.ts';
import { toRoomDefinition } from '../../adapters/assets/mapping.ts';
import type { SoundMixer } from '../../adapters/audio/SoundMixer.ts';
import type { KeyboardState } from '../../adapters/input/KeyboardState.ts';
import { buildBindings, TickInputSampler } from '../../adapters/input/TickInputSampler.ts';
import type { ClipBuffers } from '../../adapters/render/clips/ClipBuffers.ts';
import { HudAction, HudRenderer } from '../../adapters/render/hud/HudRenderer.ts';
import type { Surface } from '../../adapters/render/surface.ts';
import type { SymbolRenderer } from '../../adapters/render/symbols/SymbolRenderer.ts';
import type { VisualPainter } from '../../adapters/render/world/VisualPainter.ts';
import { WorldRenderer } from '../../adapters/render/world/WorldRenderer.ts';
import { prewarmCollections } from '../../adapters/render/xsi/collections.ts';
import type { XsiFrameCache } from '../../adapters/render/xsi/XsiFrameCache.ts';
import type { AnimationCatalog } from '../../domain/animation/AnimationCatalog.ts';
import type { Rng } from '../../domain/math/Rng.ts';
import type { ThingFactory } from '../../domain/things/ThingFactory.ts';
import type { Logger } from '../../observability/logger.ts';
import { GameSession } from '../../services/GameSession.ts';
import { Cursor, PointerPhase, type FlowControls, type GameSelection, type PointerInput, type Screen } from '../../services/ScreenFlow.ts';
import { toGameOptions, type SettingsService } from '../../services/SettingsService.ts';
import { AppError, ErrorCode } from '../../text/errors.ts';
import type { Shell } from '../shell/Shell.ts';

export const VIEW_SIDES = 2;

export interface RenderKit {
  readonly renderer: SymbolRenderer;
  readonly clips: ClipBuffers;
  readonly characters: XsiFrameCache;
  readonly painter: VisualPainter;
  readonly stage: Surface;
}

export interface GameScreenDependencies {
  readonly shell: Shell;
  readonly kit: RenderKit;
  readonly catalogs: GameCatalogs;
  readonly animations: AnimationCatalog;
  readonly factory: ThingFactory;
  readonly settings: SettingsService;
  readonly audio: SoundMixer;
  readonly keyboard: KeyboardState;
  readonly rng: Rng;
  readonly logger: Logger;
  readonly controls: FlowControls;
  readonly selection: GameSelection;
}

export class GameScreen implements Screen {
  readonly name = 'game';
  readonly cursor = Cursor.Default;
  private readonly renderer: WorldRenderer;
  private readonly session: GameSession;

  constructor(private readonly deps: GameScreenDependencies) {
    const room = deps.catalogs.rooms.get(deps.selection.roomId);
    if (!room) throw new AppError(ErrorCode.RoomUnknown, deps.selection.roomId);
    const settings = deps.settings.settings;
    const options = toGameOptions(settings, deps.selection.mode);
    const hud = new HudRenderer(deps.kit.renderer, options.gameMode);
    this.renderer = new WorldRenderer(room, deps.kit.renderer, deps.kit.clips, deps.kit.painter, hud, {
      gameMode: options.gameMode,
      detail: options.detail,
      viewSide: () => deps.settings.settings.viewSideDeathMatch,
    });
    for (const collection of prewarmCollections(options)) deps.kit.characters.enqueue(collection);
    deps.keyboard.releaseAll();
    deps.keyboard.clearEdges();
    const sampler = new TickInputSampler(buildBindings(settings.keys.player1, settings.keys.player2, options.gameMode));
    this.session = GameSession.start({
      room: toRoomDefinition(room),
      options,
      rng: deps.rng,
      factory: deps.factory,
      animations: deps.animations,
      audio: deps.audio,
      scene: this.renderer,
      input: { sample: (extras) => sampler.sample(deps.keyboard, extras) },
      logger: deps.logger,
      onCompleted: (result) => deps.controls.finishGame(result),
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
    const action = this.renderer.hud.hitTest(input.point);
    if (action === HudAction.Quit) this.session.requestQuit();
    if (action === HudAction.SwitchSides) {
      this.deps.settings.update((settings) => ({ ...settings, viewSideDeathMatch: (settings.viewSideDeathMatch + 1) % VIEW_SIDES }));
    }
  }

  key(): boolean {
    return false;
  }

  suspend(): void {
    this.session.forcePause();
  }

  dispose(): void {
    this.deps.audio.stopAll();
  }
}
