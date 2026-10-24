import './ui/shell/shell.css';
import './ui/mobile/mobile.css';
import './ui/touch/touch.css';
import './ui/hud/playerList.css';
import { browserFetcher, loadCatalogs } from './adapters/assets/AssetLoader.ts';
import { fontFamily, loadFonts } from './adapters/assets/FontLoader.ts';
import { decodeBrowserImage, GraphicImages } from './adapters/assets/GraphicImages.ts';
import { toAnimationCatalog } from './adapters/assets/mapping.ts';
import type { LoadProgress } from './adapters/assets/tuning.ts';
import { SoundMixer, type AudioOutput } from './adapters/audio/SoundMixer.ts';
import { WebAudioOutput } from './adapters/audio/WebAudioOutput.ts';
import { KeyboardState } from './adapters/input/KeyboardState.ts';
import { BrowserLobbyLink } from './adapters/net/BrowserLobbyLink.ts';
import { defaultServerUrl, ServerConnection } from './adapters/net/ServerConnection.ts';
import { browserSessionLocks, TabSession } from './adapters/net/TabSession.ts';
import { SESSION_CLAIM_WAIT_MS } from './adapters/net/tuning.ts';
import { boundCodes, buildBindings, PLAYER_LIST_CODES } from './adapters/input/TickInputSampler.ts';
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
import { serviceWorkerUrl } from './adapters/assets/assetCache.ts';
import { SeededRng } from './domain/math/Rng.ts';
import { createThingFactory } from './domain/things/factory.ts';
import { browserLoopClock, GameLoop } from './entry/GameLoop.ts';
import { debounce } from './entry/debounce.ts';
import { attachListeners, presenceOf } from './entry/listeners.ts';
import { AudioChange, freezes, type Presence } from './entry/presence.ts';
import type { GameStarted } from './net/protocol.ts';
import { createLogger, type Logger } from './observability/logger.ts';
import { LobbyInvite } from './services/online/LobbyInvite.ts';
import { OnlineClient } from './services/online/OnlineClient.ts';
import { ScreenFlow, TouchLayout, type ScreenFactory } from './services/ScreenFlow.ts';
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
import { attachHomeScreenHint, attachRotateHint, setHomeScreenTitle } from './ui/mobile/MobileChrome.ts';
import { TouchControls } from './ui/touch/TouchControls.ts';
import { SoftKeyboard } from './ui/mobile/SoftKeyboard.ts';
import { entersFullscreenOnTap } from './ui/mobile/fullscreenTap.ts';
import { PlayerListOverlay } from './ui/hud/PlayerListOverlay.ts';
import { GameMenuKey } from './ui/screens/gameMenu/tuning.ts';
import { RESIZE_SETTLE_DELAY_MS } from './ui/shell/tuning.ts';
import { PORTRAIT_TOUCH_QUERY } from './ui/mobile/tuning.ts';
import { enterLandscapeFullscreen, isHomeScreenCandidate } from './adapters/display/fullscreen.ts';
import { CanvasAreaLimit, offscreenAreaProbe, readDeviceHint } from './adapters/display/canvasArea.ts';
import { planeBudgetArea, planeResolution, type PlaneLimits, type PlaneSize } from './adapters/render/world/planeResolution.ts';
import type { RoomDetail } from './services/roomDetail.ts';

const APP_ELEMENT_ID = 'app';
const COARSE_POINTER_QUERY = '(pointer: coarse)';
const VISIBLE_TOP_PROPERTY = '--visible-top';
const VISIBLE_HEIGHT_PROPERTY = '--visible-height';
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
  if (settings.assetWorker) registerAssetWorker(settings.assetBaseUrl, logger);
  const tabSession = TabSession.restore(new LocalStorageStore(window.sessionStorage), browserSessionLocks(navigator), () => AbortSignal.timeout(SESSION_CLAIM_WAIT_MS));
  const showProgress = (progress: LoadProgress): void => shell.showStatus(progressText(progress));
  shell.showStatus(t('boot.loading'));
  const catalogs = await loadCatalogs(browserFetcher, settings.assetBaseUrl, showProgress);
  const images = new GraphicImages();
  await images.loadAll(catalogs.symbols, { locator: catalogs.locator, symbolsCatalogPath: catalogs.manifest.catalogs.symbols }, decodeBrowserImage, showProgress);
  await loadFonts(catalogs.fonts, { locator: catalogs.locator, fontsCatalogPath: catalogs.manifest.catalogs.fonts }, showProgress);
  const webAudio = WebAudioOutput.create();
  if (webAudio) {
    await webAudio.load(catalogs.sounds, { locator: catalogs.locator, soundsCatalogPath: catalogs.manifest.catalogs.sounds }, browserFetcher, showProgress);
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
  const planeLimits = roomPlaneLimits(logger);
  const kit = {
    renderer,
    clips,
    characters,
    painter: new VisualPainter(clips, characters),
    planeResolution: (size: PlaneSize, screenResolution: number, detail: RoomDetail) => planeResolution(detail, screenResolution, size, planeLimits),
  };
  const animations = toAnimationCatalog(catalogs.animMeta, catalogs.symbols);
  const factory = createThingFactory();
  const keyboard = new KeyboardState();
  const menuKit: MenuKit = { shell, renderer, audio, stage: new LayeredStage(renderer, STAGE_WIDTH_PX, STAGE_HEIGHT_PX) };
  const menuRng = new SeededRng(randomSeed());
  let startOnlineGame: (start: GameStarted) => void = () => undefined;
  const online = new OnlineClient({
    session: await tabSession,
    name: () => userSettings.settings.playerName,
    logger,
    onGameStarted: (start) => startOnlineGame(start),
    now: () => performance.now(),
  });
  online.bind(
    new ServerConnection(
      settings.serverUrl ?? defaultServerUrl(window.location),
      {
        opened: () => online.opened(),
        closed: () => online.closed(),
        message: (message) => online.receive(message),
        rejected: (byteLength) => online.rejected(byteLength),
      },
      new SeededRng(randomSeed()),
    ),
  );

  const link = new BrowserLobbyLink(window);
  const invite = new LobbyInvite(online, link);
  invite.syncAddress();

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
        room: new LobbyRoom({ client: online, rooms: catalogs.roomIndex, controls, mode: entry.mode, result: entry.result, invite }),
      }),
    onlineGame: (controls, start) =>
      new OnlineGameScreen({ shell, kit, catalogs, settings: userSettings, audio, keyboard, client: online, logger, controls, start, uiRng: menuRng, invite }),
  };
  const flow = new ScreenFlow(screens, logger, (cursor) => shell.setCursor(cursor), online);
  startOnlineGame = (start) => flow.startOnlineGame(start);
  const portrait = window.matchMedia(PORTRAIT_TOUCH_QUERY);
  let presence: Presence = presenceOf(document, portrait);
  const loop = new GameLoop(
    flow,
    browserLoopClock,
    () => userSettings.settings.frameRate,
    (error) => logger.error(LogEvent.FrameFailed, { screen: flow.screen?.name, error: error instanceof Error ? (error.stack ?? error.message) : String(error) }),
    () => freezes(presence, flow.screen?.simulation),
  );
  const gameKeys = (): ReadonlySet<string> => boundCodes(buildBindings(userSettings.settings.keys));
  let keys = gameKeys();
  userSettings.subscribe(() => (keys = gameKeys()));
  const touch = new TouchControls(
    { document, keyboard, toggleMenu: () => flow.key(GameMenuKey.Toggle), vibrate: (durationMs) => navigator.vibrate?.(durationMs) },
    window.matchMedia(COARSE_POINTER_QUERY).matches,
  );
  const softKeyboard = new SoftKeyboard({ document, entry: () => flow.screen?.textEntry, key: (code, typed) => flow.key(code, typed) });
  const playerList = new PlayerListOverlay(document, shell.root);
  const syncTouch = (): void => {
    touch.sync(flow.screen?.touchLayout ?? TouchLayout.Hidden);
    playerList.show(PLAYER_LIST_CODES.some((code) => keyboard.isDown(code)) ? flow.screen?.playerList : undefined);
    softKeyboard.sync();
    window.requestAnimationFrame(syncTouch);
  };
  syncTouch();
  const settleResolution = debounce(() => fitShell(shell), RESIZE_SETTLE_DELAY_MS, {
    start: (run, delayMs) => window.setTimeout(run, delayMs),
    cancel: (handle) => window.clearTimeout(handle),
  });
  attachListeners(
    { window, document, canvas: shell.canvas, portrait, stageWidth: STAGE_WIDTH_PX, stageHeight: STAGE_HEIGHT_PX },
    {
      keyboard,
      flow,
      loop,
      isGameKey: (code) => keys.has(code),
      onGesture: (touchInput) => {
        touch.setTouchInput(touchInput);
        if (touchInput) softKeyboard.open();
        if (webAudio && !webAudio.unlocked) void webAudio.unlock().then(() => logger.info(LogEvent.AudioUnlocked));
        if (touchInput && entersFullscreenOnTap(flow.screen?.touchLayout)) void enterLandscapeFullscreen(document, window.screen.orientation).then((entered) => entered && logger.info(LogEvent.FullscreenEntered));
      },
      onPresence: (next, effects) => {
        presence = next;
        logger.info(LogEvent.PresenceChanged, { ...next, frozen: freezes(next, flow.screen?.simulation) });
        if (effects.releaseKeys) touch.releaseAll();
        if (effects.audio === AudioChange.Suspend) void webAudio?.suspend();
        if (effects.audio === AudioChange.Resume) void webAudio?.unlock();
      },
      onResize: () => {
        shell.layout(visibleViewport());
        settleResolution();
      },
    },
  );
  flow.start();
  if (link.initialCode !== undefined) flow.joinByCode(link.initialCode);
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

function roomPlaneLimits(logger: Logger): PlaneLimits {
  const hint = readDeviceHint({ navigator, coarsePointer: window.matchMedia(COARSE_POINTER_QUERY).matches });
  const budgetArea = planeBudgetArea(hint);
  logger.info(LogEvent.PlaneBudget, { budgetArea, memoryGiB: hint.memoryGiB, touch: hint.touch });
  const canvasArea = new CanvasAreaLimit(offscreenAreaProbe);
  return { budgetArea, usableArea: (wanted) => canvasArea.usableArea(wanted) };
}

function registerAssetWorker(assetBaseUrl: string, logger: Logger): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(serviceWorkerUrl(window.location.href, assetBaseUrl)).then(
    () => logger.info(LogEvent.AssetWorkerRegistered),
    (error: unknown) => logger.warn(LogEvent.AssetWorkerFailed, { reason: String(error) }),
  );
}

function browserViewport(view: Window): Viewport {
  const visible = view.visualViewport;
  return { width: visible?.width ?? view.innerWidth, height: visible?.height ?? view.innerHeight, devicePixelRatio: view.devicePixelRatio };
}

function visibleViewport(): Viewport {
  const viewport = browserViewport(window);
  const root = document.documentElement.style;
  root.setProperty(VISIBLE_TOP_PROPERTY, `${window.visualViewport?.offsetTop ?? 0}px`);
  root.setProperty(VISIBLE_HEIGHT_PROPERTY, `${viewport.height}px`);
  return viewport;
}

function fitShell(shell: Shell): void {
  shell.fit(visibleViewport());
}

function main(): void {
  const host = document.getElementById(APP_ELEMENT_ID);
  if (!host) return;
  const shell = Shell.create(document, host);
  fitShell(shell);
  setHomeScreenTitle(document);
  attachRotateHint(document);
  if (isHomeScreenCandidate(navigator, document.fullscreenEnabled)) attachHomeScreenHint(document, (run, delayMs) => window.setTimeout(run, delayMs));
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
