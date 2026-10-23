import './ui/shell/shell.css';
import { browserFetcher, loadCatalogs } from './adapters/assets/AssetLoader.ts';
import { fontFamily, loadFonts } from './adapters/assets/FontLoader.ts';
import { decodeBrowserImage, GraphicImages } from './adapters/assets/GraphicImages.ts';
import { toAnimationCatalog } from './adapters/assets/mapping.ts';
import type { LoadProgress } from './adapters/assets/tuning.ts';
import { SoundMixer, type AudioOutput } from './adapters/audio/SoundMixer.ts';
import { WebAudioOutput } from './adapters/audio/WebAudioOutput.ts';
import { KeyboardState } from './adapters/input/KeyboardState.ts';
import { boundCodes, buildBindings } from './adapters/input/TickInputSampler.ts';
import { ClipBuffers } from './adapters/render/clips/ClipBuffers.ts';
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
import { GameMode } from './domain/world/GameMode.ts';
import { GameLoop } from './entry/GameLoop.ts';
import { attachListeners } from './entry/listeners.ts';
import { createLogger, type Logger } from './observability/logger.ts';
import { ScreenFlow, type ScreenFactory } from './services/ScreenFlow.ts';
import { SettingsService } from './services/SettingsService.ts';
import { AppError, ErrorCode } from './text/errors.ts';
import { t } from './text/i18n.ts';
import { LogEvent } from './text/logEvents.ts';
import { GameScreen } from './ui/screens/GameScreen.ts';
import { PickerScreen } from './ui/screens/PickerScreen.ts';
import { Shell, STAGE_HEIGHT_PX, STAGE_WIDTH_PX } from './ui/shell/Shell.ts';

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
  const audio = new SoundMixer(webAudio ?? silentOutput, userSettings.settings.soundActive);
  userSettings.subscribe((current) => audio.setSfxActive(current.soundActive));

  const renderer = new SymbolRenderer(new SymbolLibrary(catalogs.symbols), images, offscreenSurfaces, { fontFamily });
  const clips = new ClipBuffers(renderer);
  const characters = new XsiFrameCache(catalogs.xsi, new XsiRasterizer(offscreenSurfaces, new XsiTextures(renderer)));
  const kit = { renderer, clips, characters, painter: new VisualPainter(clips, characters), stage: offscreenSurfaces.create(STAGE_WIDTH_PX, STAGE_HEIGHT_PX) };
  const animations = toAnimationCatalog(catalogs.animMeta, catalogs.symbols);
  const factory = createThingFactory();
  const keyboard = new KeyboardState();

  const screens: ScreenFactory = {
    picker: (controls, lastResult) => new PickerScreen({ shell, settings: userSettings, rooms: catalogs.roomIndex, controls, lastResult }),
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
        logger,
        controls,
        selection,
      }),
  };
  const flow = new ScreenFlow(screens, logger);
  const loop = new GameLoop(flow);
  const gameKeys = (): ReadonlySet<string> => {
    const { player1, player2 } = userSettings.settings.keys;
    return new Set(Object.values(GameMode).flatMap((mode) => [...boundCodes(buildBindings(player1, player2, mode))]));
  };
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
      onResize: () => shell.fit(window.innerWidth, window.innerHeight),
    },
  );
  flow.start();
  loop.start();
}

function main(): void {
  const host = document.getElementById(APP_ELEMENT_ID);
  if (!host) return;
  const shell = Shell.create(document, host);
  shell.fit(window.innerWidth, window.innerHeight);
  let logger: Logger = createLogger(loadSettings({}).logLevel, crypto.randomUUID());
  try {
    logger = createLogger(loadSettings(readBrowserEnv()).logLevel, crypto.randomUUID());
  } catch (error) {
    logger.error(LogEvent.BootFailed, { code: ErrorCode.ConfigInvalid, error: String(error) });
  }
  logger.info(LogEvent.BootStarted);
  boot(shell, logger).catch((error: unknown) => {
    logger.error(LogEvent.BootFailed, { error: String(error) });
    const missing = error instanceof AppError && error.code === ErrorCode.AssetMissing;
    shell.showStatus(missing ? t('boot.missingAssets') : t('boot.failed', { reason: error instanceof Error ? error.message : String(error) }));
  });
}

main();
