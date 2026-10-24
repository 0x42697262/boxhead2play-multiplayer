import { effectPreferences } from '../../services/menuSettings.ts';
import type { GameCatalogs } from '../../adapters/assets/AssetLoader.ts';
import { toRoomDefinition } from '../../adapters/assets/mapping.ts';
import type { SoundMixer } from '../../adapters/audio/SoundMixer.ts';
import type { KeyboardState } from '../../adapters/input/KeyboardState.ts';
import { buildBindings, TickInputSampler } from '../../adapters/input/TickInputSampler.ts';
import type { ClipBuffers } from '../../adapters/render/clips/ClipBuffers.ts';
import { HudAction, HudRenderer } from '../../adapters/render/hud/HudRenderer.ts';
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
import type { Cursor} from '../../services/ScreenFlow.ts';
import { PointerPhase, TouchLayout, type FlowControls, type GameSelection, type PointerInput, type Screen } from '../../services/ScreenFlow.ts';
import { toGameOptions, type SettingsService } from '../../services/SettingsService.ts';
import { AppError, ErrorCode } from '../../text/errors.ts';
import type { Shell } from '../shell/Shell.ts';
import { GameMenu } from './gameMenu/GameMenu.ts';

export interface RenderKit {
  readonly renderer: SymbolRenderer;
  readonly clips: ClipBuffers;
  readonly characters: XsiFrameCache;
  readonly painter: VisualPainter;
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
  readonly uiRng: Rng;
  readonly logger: Logger;
  readonly controls: FlowControls;
  readonly selection: GameSelection;
}

export class GameScreen implements Screen {
  readonly name = 'game';
  private readonly menu: GameMenu;
  private readonly renderer: WorldRenderer;
  private readonly session: GameSession;

  constructor(private readonly deps: GameScreenDependencies) {
    const room = deps.catalogs.rooms.get(deps.selection.roomId);
    if (!room) throw new AppError(ErrorCode.RoomUnknown, deps.selection.roomId);
    const settings = deps.settings.settings;
    const options = toGameOptions(settings, deps.selection.mode);
    const hud = new HudRenderer(deps.kit.renderer, options.gameMode);
    this.renderer = new WorldRenderer(room, deps.kit.renderer, deps.kit.clips, deps.kit.painter, hud, { detail: options.detail, resolution: () => deps.shell.resolution, effects: () => effectPreferences(deps.settings.settings) });
    for (const collection of prewarmCollections(options)) deps.kit.characters.enqueue(collection);
    deps.keyboard.releaseAll();
    deps.keyboard.clearEdges();
    const sampler = new TickInputSampler(buildBindings(settings.keys));
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
    this.menu = new GameMenu({ shell: deps.shell, renderer: deps.kit.renderer, audio: deps.audio, settings: deps.settings, rng: deps.uiRng, quit: () => this.session.requestQuit() });
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

  tick(): void {
    this.session.tick();
    this.menu.tick();
  }

  present(): void {
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
    const action = this.renderer.hud.hitTest(input.point);
    if (action === HudAction.Quit) this.session.requestQuit();
  }

  key(code: string): boolean {
    return this.menu.key(code);
  }

  suspend(): void {}

  dispose(): void {
    this.deps.audio.stopAll();
  }
}
