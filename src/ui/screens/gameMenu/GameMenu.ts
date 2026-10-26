import type { DisplayItem, Filter } from '../../../adapters/assets/schemas.ts';
import type { SoundMixer } from '../../../adapters/audio/SoundMixer.ts';
import { LayeredStage, type StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import type { SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import type { SymbolRenderer } from '../../../adapters/render/symbols/SymbolRenderer.ts';
import type { Rng } from '../../../domain/math/Rng.ts';
import type { Logger } from '../../../observability/logger.ts';
import { SoundId } from '../../../domain/sounds.ts';
import { Cursor, type PointerInput } from '../../../services/ScreenFlow.ts';
import type { InviteView } from '../../../services/online/LobbyInvite.ts';
import type { SettingsService } from '../../../services/SettingsService.ts';
import { t } from '../../../text/i18n.ts';
import type { StaticTextFrame } from '../online/stageText.ts';
import { menuButtonLabelFrame, sceneMenuButton } from '../menu/menuButtonLabel.ts';
import { sceneHitTest } from '../menu/MenuCore.ts';
import { mapTargets, MenuPointer, Trigger, type MenuTarget } from '../menu/MenuPointer.ts';
import { OverrideTree } from '../menu/overrideTree.ts';
import { rollOverFilters } from '../menu/rollOver.ts';
import { ControlsOutcome, ControlsWindow, controlsWindowLayout, type ControlsAction, type ControlsWindowLayout } from '../menu/ControlsWindow.ts';
import { applySetupAction, SETUP_EXPANDED, SetupOutcome, SetupWindow, setupWindowLayout, type SetupAction, type SetupWindowLayout } from '../menu/SetupWindow.ts';
import { MainMenuChild, MenuSymbol, SelectWorldChild } from '../menu/tuning.ts';
import type { Shell } from '../../shell/Shell.ts';
import { STAGE_HEIGHT_PX, STAGE_WIDTH_PX } from '../../shell/Shell.ts';
import { GAME_MENU_BACKDROP, GameMenuButton, GameMenuKey } from './tuning.ts';

export const GameMenuView = {
  Closed: 'closed',
  Choices: 'choices',
  Settings: 'settings',
  Controls: 'controls',
} as const;

export type GameMenuView = (typeof GameMenuView)[keyof typeof GameMenuView];

export const GameMenuAction = {
  CopyLink: 'copyLink',
  OpenSettings: 'openSettings',
  OpenControls: 'openControls',
  Quit: 'quit',
  Settings: 'settings',
  Controls: 'controls',
} as const;

export type GameMenuAction =
  | { readonly kind: typeof GameMenuAction.CopyLink }
  | { readonly kind: typeof GameMenuAction.OpenSettings }
  | { readonly kind: typeof GameMenuAction.OpenControls }
  | { readonly kind: typeof GameMenuAction.Quit }
  | { readonly kind: typeof GameMenuAction.Settings; readonly action: SetupAction }
  | { readonly kind: typeof GameMenuAction.Controls; readonly action: ControlsAction };

const INVITE_TARGET: MenuTarget<GameMenuAction> = { path: [GameMenuButton.Invite], trigger: Trigger.Release, action: { kind: GameMenuAction.CopyLink } };
const CHOICE_TARGETS: readonly MenuTarget<GameMenuAction>[] = [
  { path: [GameMenuButton.Settings], trigger: Trigger.Release, action: { kind: GameMenuAction.OpenSettings } },
  { path: [GameMenuButton.Controls], trigger: Trigger.Release, action: { kind: GameMenuAction.OpenControls } },
  { path: [GameMenuButton.Quit], trigger: Trigger.Release, action: { kind: GameMenuAction.Quit } },
];

const GAME_MENU_EXPANDED: ReadonlySet<string> = new Set([...SETUP_EXPANDED, SelectWorldChild.WindowControls, SelectWorldChild.PressKey]);

const BUTTONS: readonly GameMenuButton[] = [GameMenuButton.Invite, GameMenuButton.Settings, GameMenuButton.Controls, GameMenuButton.Quit];
const BUTTON_NAMES: ReadonlySet<string> = new Set(BUTTONS);

export interface GameMenuLayout {
  readonly items: readonly DisplayItem[];
  readonly labels: Readonly<Record<GameMenuButton, StaticTextFrame | undefined>>;
  readonly setup: SetupWindowLayout;
  readonly controls: ControlsWindowLayout;
}

export function gameMenuLayout(library: SymbolLibrary): GameMenuLayout {
  const mainId = library.characterId(MenuSymbol.Main);
  const selectId = library.characterId(MenuSymbol.SelectWorld);
  const main = mainId === undefined ? [] : library.frameItems(mainId, 0);
  const selectItems = selectId === undefined ? [] : library.frameItems(selectId, 0);
  const window = selectItems.find((item) => item.name === MainMenuChild.OptionsWindow);
  const controlsWindow = selectItems.find((item) => item.name === SelectWorldChild.WindowControls);
  const windows = [window, controlsWindow].filter((item) => item !== undefined);
  const buttons = main.filter((item) => item.name !== undefined && BUTTON_NAMES.has(item.name));
  return {
    items: [...buttons, ...windows].sort((first, second) => first.depth - second.depth),
    labels: {
      [GameMenuButton.Invite]: menuButtonLabelFrame(library, main, GameMenuButton.Invite),
      [GameMenuButton.Settings]: menuButtonLabelFrame(library, main, GameMenuButton.Settings),
      [GameMenuButton.Controls]: menuButtonLabelFrame(library, main, GameMenuButton.Controls),
      [GameMenuButton.Quit]: menuButtonLabelFrame(library, main, GameMenuButton.Quit),
    },
    setup: setupWindowLayout(library, window),
    controls: controlsWindowLayout(library, windows),
  };
}

export function nextViewOnEscape(view: GameMenuView): GameMenuView {
  switch (view) {
    case GameMenuView.Settings:
    case GameMenuView.Controls:
      return GameMenuView.Choices;
    case GameMenuView.Choices:
      return GameMenuView.Closed;
    case GameMenuView.Closed:
      return GameMenuView.Choices;
  }
}

export interface GameMenuDependencies {
  readonly shell: Shell;
  readonly renderer: SymbolRenderer;
  readonly audio: SoundMixer;
  readonly settings: SettingsService;
  readonly rng: Rng;
  readonly logger: Logger;
  readonly ticksPerSecond: () => number;
  readonly quit: () => void;
  readonly invite?: InviteView;
}

export class GameMenu {
  private readonly pointerState = new MenuPointer<GameMenuAction>();
  private readonly stage: LayeredStage;
  private readonly layout: GameMenuLayout;
  private readonly setup: SetupWindow;
  private readonly controls: ControlsWindow;
  private current: GameMenuView = GameMenuView.Closed;
  private rolledOver: { readonly name: string; readonly filters: readonly Filter[] } | undefined = undefined;

  constructor(private readonly deps: GameMenuDependencies) {
    this.stage = new LayeredStage(deps.renderer, STAGE_WIDTH_PX, STAGE_HEIGHT_PX);
    this.layout = gameMenuLayout(deps.renderer.library);
    this.setup = new SetupWindow(deps.renderer.library, this.layout.setup);
    this.controls = new ControlsWindow({
      library: deps.renderer.library,
      layout: this.layout.controls,
      settings: deps.settings,
      logger: deps.logger,
      ticksPerSecond: deps.ticksPerSecond,
    });
  }

  get view(): GameMenuView {
    return this.current;
  }

  get open(): boolean {
    return this.current !== GameMenuView.Closed;
  }

  get cursor(): Cursor {
    return this.open ? this.pointerState.cursor : Cursor.Default;
  }

  key(code: string): boolean {
    if (this.current === GameMenuView.Controls && this.controls.key(code)) {
      this.pointerState.refresh(this.hitTest());
      return true;
    }
    if (code !== GameMenuKey.Toggle) return false;
    this.show(nextViewOnEscape(this.current));
    return true;
  }

  tick(): void {
    this.controls.tick();
    const hovered = this.current === GameMenuView.Choices ? this.pointerState.hoveredTarget?.path[0] : undefined;
    this.rolledOver = hovered === undefined ? undefined : { name: hovered, filters: rollOverFilters(this.deps.rng) };
  }

  pointer(input: PointerInput): void {
    if (!this.open) return;
    const action = this.pointerState.handle(input, this.hitTest());
    if (action !== undefined) this.perform(action);
    this.pointerState.refresh(this.hitTest());
  }

  present(): void {
    if (!this.open) return;
    const { shell } = this.deps;
    const { ctx, canvas } = shell;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = GAME_MENU_BACKDROP;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.stage.setResolution(shell.resolution);
    const surface = this.stage.render(this.scene());
    ctx.drawImage(surface.canvas, 0, 0, canvas.width, canvas.height);
  }

  perform(action: GameMenuAction): void {
    const { audio } = this.deps;
    switch (action.kind) {
      case GameMenuAction.CopyLink:
        audio.play(SoundId.Click);
        this.deps.invite?.copy();
        return;
      case GameMenuAction.OpenSettings:
        audio.play(SoundId.Click);
        this.show(GameMenuView.Settings);
        return;
      case GameMenuAction.OpenControls:
        audio.play(SoundId.Click);
        this.show(GameMenuView.Controls);
        return;
      case GameMenuAction.Controls:
        audio.play(SoundId.Click2);
        if (this.controls.perform(action.action) === ControlsOutcome.Closed) this.show(GameMenuView.Choices);
        return;
      case GameMenuAction.Quit:
        audio.play(SoundId.Click);
        this.show(GameMenuView.Closed);
        this.deps.quit();
        return;
      case GameMenuAction.Settings:
        audio.play(SoundId.Click2);
        if (applySetupAction(this.deps.settings, action.action) === SetupOutcome.Closed) this.show(GameMenuView.Choices);
        return;
    }
  }

  targets(): readonly MenuTarget<GameMenuAction>[] {
    switch (this.current) {
      case GameMenuView.Closed:
        return [];
      case GameMenuView.Choices:
        return this.inviteShown ? [INVITE_TARGET, ...CHOICE_TARGETS] : CHOICE_TARGETS;
      case GameMenuView.Settings:
        return mapTargets(this.setup.targets(), (action) => ({ kind: GameMenuAction.Settings, action }));
      case GameMenuView.Controls:
        return mapTargets(this.controls.targets(), (action) => ({ kind: GameMenuAction.Controls, action }));
    }
  }

  scene(): StageScene {
    const tree = new OverrideTree();
    const library = this.deps.renderer.library;
    const choices = this.current === GameMenuView.Choices;
    for (const name of BUTTONS) {
      if (!choices || (name === GameMenuButton.Invite && !this.inviteShown)) {
        tree.set([name], { visible: false });
        continue;
      }
      const rolled = this.rolledOver?.name === name ? this.rolledOver : undefined;
      sceneMenuButton(tree, library, { name, frame: this.layout.labels[name], text: this.buttonText(name), highlighted: rolled !== undefined, filters: rolled?.filters });
    }
    this.setup.scene(tree, this.current === GameMenuView.Settings, this.deps.settings.settings, (path) => this.pointerState.buttonState(path));
    this.controls.scene(tree, this.current === GameMenuView.Controls, (path) => this.pointerState.buttonState(path));
    return { items: this.layout.items, overrides: tree.overrides, expand: GAME_MENU_EXPANDED, transparent: true };
  }

  private get inviteShown(): boolean {
    return this.deps.invite?.code !== undefined;
  }

  private buttonText(name: GameMenuButton): string {
    switch (name) {
      case GameMenuButton.Invite: {
        const invite = this.deps.invite;
        return invite?.copied ? t('invite.copied') : t('invite.copy', { code: invite?.code ?? '' });
      }
      case GameMenuButton.Settings:
        return t('setup.menuButton');
      case GameMenuButton.Controls:
        return t('gameMenu.controls');
      case GameMenuButton.Quit:
        return t('gameMenu.quit');
    }
  }

  private show(view: GameMenuView): void {
    if (this.current === GameMenuView.Closed) this.deps.invite?.forget();
    this.current = view;
    this.rolledOver = undefined;
    this.pointerState.refresh(this.hitTest());
  }

  private hitTest(): ReturnType<typeof sceneHitTest<GameMenuAction>> {
    return sceneHitTest(this.deps.renderer.library, this.scene(), this.targets());
  }
}
