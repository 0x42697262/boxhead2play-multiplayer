import './ui/shell/shell.css';
import { browserFetcher, loadCatalogs } from './adapters/assets/AssetLoader.ts';
import { fontFamily, loadFonts } from './adapters/assets/FontLoader.ts';
import { decodeBrowserImage, GraphicImages } from './adapters/assets/GraphicImages.ts';
import { toAnimationCatalog } from './adapters/assets/mapping.ts';
import type { LoadProgress } from './adapters/assets/tuning.ts';
import { SoundMixer, type AudioOutput } from './adapters/audio/SoundMixer.ts';
import { WebAudioOutput } from './adapters/audio/WebAudioOutput.ts';
import { KeyboardState } from './adapters/input/KeyboardState.ts';
import { defaultServerUrl, ServerConnection } from './adapters/net/ServerConnection.ts';
import { boundCodes, buildBindings } from './adapters/input/TickInputSampler.ts';
import { ClipBuffers } from './adapters/render/clips/ClipBuffers.ts';
import { LayeredStage } from './adapters/render/menu/LayeredStage.ts';
import { offscreenSurfaces } from './adapters/render/surface.ts';
import { SymbolLibrary } from './adapters/render/symbols/SymbolLibrary.ts';
import { SymbolRenderer } from './adapters/render/symbols/SymbolRenderer.ts';
import { VisualPainter } from './adapters/render/world/VisualPainter.ts';
import { XsiFrameCache } from './adapters/render/xsi/XsiFrameCache.ts';
import { XsiRasterizer, XsiTextures } from './adapters/render/xsi/XsiRasterizer.ts';
import { LocalStorageStore } from './adapters/storage/KeyValueStore.ts';
import { loadSettings, readBrowserEnv } from './config/env.ts';
import { SeededRng } from './domain/math/Rng.ts';
import { createThingFactory } from './domain/things/factory.ts';
import { browserLoopClock, GameLoop } from './entry/GameLoop.ts';
import { attachListeners } from './entry/listeners.ts';
import type { GameStarted } from './net/protocol.ts';
import { createLogger, type Logger } from './observability/logger.ts';
import { OnlineClient } from './services/online/OnlineClient.ts';
import { ScreenFlow, type ScreenFactory } from './services/ScreenFlow.ts';
import { SettingsService } from './services/SettingsService.ts';
import { soundGain } from './services/menuSettings.ts';
import { AppError, ErrorCode } from './text/errors.ts';
import { t, type TextKey } from './text/i18n.ts';
import { LogEvent } from './text/logEvents.ts';
import { GameScreen } from './ui/screens/GameScreen.ts';
import { MainMenuScreen } from './ui/screens/menu/MainMenuScreen.ts';
import type { MenuKit } from './ui/screens/menu/MenuCore.ts';
import { SelectWorldScreen } from './ui/screens/menu/SelectWorldScreen.ts';
import { LobbyRoom } from './ui/screens/online/LobbyRoom.ts';
import { OnlineMenuScreen } from './ui/screens/online/OnlineMenuScreen.ts';
import { OnlineGameScreen } from './ui/screens/online/OnlineGameScreen.ts';
import { Shell, STAGE_HEIGHT_PX, STAGE_WIDTH_PX, type Viewport } from './ui/shell/Shell.ts';

const APP_ELEMENT_ID = 'app';
const PERCENT = 100;
const SEED_WORDS = 1;

const silentOutput: AudioOutput = { start: () => undefined };

function progressText(progress: LoadProgress): string {
  const percent = progress.total === 0 ? PERCENT : Math.round((progress.loaded / progress.total) * PERCENT);
  return t('shell.loading', { phase: t(`shell.phase.${progress.phase}`), percent });
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(SEED_WORDS))[0] ?? 0;
}

async function boot(shell: Shell, logger: Logger): Promise<void> {
  const settings = loadSettings(readBrowserEnv());
  const showProgress = (progress: LoadProgress): void => shell.showStatus(progressText(progress));
  shell.showStatus(t('boot.loading'));
  const catalogs = await loadCatalogs(browserFetcher, settings.assetBaseUrl, showProgress);
  const images = new GraphicImages();
  await images.loadAll(catalogs.symbols, { baseUrl: settings.assetBaseUrl, symbolsCatalogPath: catalogs.manifest.catalogs.symbols }, decodeBrowserImage, showProgress);
  await loadFonts(catalogs.fonts, { baseUrl: settings.assetBaseUrl, fontsCatalogPath: catalogs.manifest.catalogs.fonts }, showProgress);
  const webAudio = WebAudioOutput.create();
  if (webAudio) {
    await webAudio.load(catalogs.sounds, { baseUrl: settings.assetBaseUrl, soundsCatalogPath: catalogs.manifest.catalogs.sounds }, browserFetcher, showProgress);
  } else {
    logger.warn(LogEvent.AudioUnavailable);
  }
  logger.info(LogEvent.AssetsLoaded, { graphics: images.size, rooms: catalogs.rooms.size });

  const userSettings = new SettingsService(new LocalStorageStore(window.localStorage), logger);
  const audio = new SoundMixer(webAudio ?? silentOutput, soundGain(userSettings.settings));
  shell.setGraphicsQuality(userSettings.settings.graphics);
  userSettings.subscribe((current) => {
    audio.setVolume(soundGain(current));
    shell.setGraphicsQuality(current.graphics);
  });

  const renderer = new SymbolRenderer(new SymbolLibrary(catalogs.symbols), images, offscreenSurfaces, { fontFamily });
  const clips = new ClipBuffers(renderer);
  const characters = new XsiFrameCache(catalogs.xsi, new XsiRasterizer(offscreenSurfaces, new XsiTextures(renderer)));
  const kit = { renderer, clips, characters, painter: new VisualPainter(clips, characters) };
  const animations = toAnimationCatalog(catalogs.animMeta, catalogs.symbols);
  const factory = createThingFactory();
  const keyboard = new KeyboardState();
  const menuKit: MenuKit = { shell, renderer, audio, stage: new LayeredStage(renderer, STAGE_WIDTH_PX, STAGE_HEIGHT_PX) };
  const menuRng = new SeededRng(randomSeed());
  let startOnlineGame: (start: GameStarted) => void = () => undefined;
  const online = new OnlineClient({
    session: new LocalStorageStore(window.sessionStorage),
    name: () => userSettings.settings.playerName,
    logger,
    onGameStarted: (start) => startOnlineGame(start),
  });
  online.bind(
    new ServerConnection(settings.serverUrl ?? defaultServerUrl(window.location), {
      opened: () => online.opened(),
      closed: () => online.closed(),
      message: (message) => online.receive(message),
      rejected: (text) => online.rejected(text),
    }),
  );

  const screens: ScreenFactory = {
    mainMenu: (controls) => new MainMenuScreen({ kit: menuKit, rng: menuRng, controls, settings: userSettings }),
    selectWorld: (controls, mode) => new SelectWorldScreen({ kit: menuKit, settings: userSettings, rooms: catalogs.roomIndex, controls, logger, mode }),
    game: (controls, selection) =>
      new GameScreen({
        shell,
        kit,
        catalogs,
        animations,
        factory,
        settings: userSettings,
        audio,
        keyboard,
        rng: new SeededRng(randomSeed()),
        uiRng: menuRng,
        logger,
        controls,
        selection,
      }),
    onlineMenu: (controls, entry) =>
      new OnlineMenuScreen({ kit: menuKit, rng: menuRng, client: online, settings: userSettings, rooms: catalogs.roomIndex, controls, entry }),
    lobbyRoom: (controls, entry) =>
      new SelectWorldScreen({
        kit: menuKit,
        settings: userSettings,
        rooms: catalogs.roomIndex,
        controls,
        logger,
        mode: entry.mode,
        room: new LobbyRoom({ client: online, settings: userSettings, rooms: catalogs.roomIndex, controls, mode: entry.mode, result: entry.result }),
      }),
    onlineGame: (controls, start) =>
      new OnlineGameScreen({ shell, kit, catalogs, settings: userSettings, audio, keyboard, client: online, logger, controls, start, uiRng: menuRng }),
  };
  const flow = new ScreenFlow(screens, logger, (cursor) => shell.setCursor(cursor));
  startOnlineGame = (start) => flow.startOnlineGame(start);
  const loop = new GameLoop(flow, browserLoopClock, () => userSettings.settings.frameRate);
  const gameKeys = (): ReadonlySet<string> => boundCodes(buildBindings(userSettings.settings.keys));
  let keys = gameKeys();
  userSettings.subscribe(() => (keys = gameKeys()));
  attachListeners(
    { window, document, canvas: shell.canvas, stageWidth: STAGE_WIDTH_PX, stageHeight: STAGE_HEIGHT_PX },
    {
      keyboard,
      flow,
      loop,
      isGameKey: (code) => keys.has(code),
      onFirstGesture: () => {
        void webAudio?.unlock().then(() => logger.info(LogEvent.AudioUnlocked));
      },
      onVisibility: (visible) => {
        logger.info(LogEvent.VisibilityChanged, { visible });
        if (!visible) void webAudio?.suspend();
        else void webAudio?.unlock();
      },
      onResize: () => shell.fit(browserViewport(window)),
    },
  );
  flow.start();
  loop.start();
}

const BOOT_FAILURE_TEXT: Partial<Record<ErrorCode, TextKey>> = {
  [ErrorCode.AssetMissing]: 'boot.missingAssets',
  [ErrorCode.AssetServedAsPage]: 'boot.staleAssets',
  [ErrorCode.AssetTimedOut]: 'boot.assetTimedOut',
};

function bootFailureText(error: unknown): string {
  const key = error instanceof AppError ? BOOT_FAILURE_TEXT[error.code] : undefined;
  return key ? t(key) : t('boot.failed', { reason: error instanceof Error ? error.message : String(error) });
}

function browserViewport(view: Window): Viewport {
  return { width: view.innerWidth, height: view.innerHeight, devicePixelRatio: view.devicePixelRatio };
}

function main(): void {
  const host = document.getElementById(APP_ELEMENT_ID);
  if (!host) return;
  const shell = Shell.create(document, host);
  shell.fit(browserViewport(window));
  let logger: Logger = createLogger(loadSettings({}).logLevel, crypto.randomUUID());
  try {
    logger = createLogger(loadSettings(readBrowserEnv()).logLevel, crypto.randomUUID());
  } catch (error) {
    logger.error(LogEvent.BootFailed, { code: ErrorCode.ConfigInvalid, error: String(error) });
  }
  logger.info(LogEvent.BootStarted);
  boot(shell, logger).catch((error: unknown) => {
    logger.error(LogEvent.BootFailed, { error: String(error) });
    shell.showError(bootFailureText(error));
  });
}

main();
