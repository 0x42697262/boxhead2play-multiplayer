import type { DisplayItem, Filter } from '../../../adapters/assets/schemas.ts';
import type { Matrix } from '../../../adapters/render/geometry/Matrix.ts';
import type { StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import type { SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import type { Rng } from '../../../domain/math/Rng.ts';
import { SoundId } from '../../../domain/sounds.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import type { Cursor, FlowControls, PointerInput, Screen } from '../../../services/ScreenFlow.ts';
import type { SettingsService } from '../../../services/SettingsService.ts';
import { t } from '../../../text/i18n.ts';
import { normalizeLobbyCode } from '../../../net/lobbyCode.ts';
import { LOBBY_CODE_LENGTH } from '../../../net/tuning.ts';
import { editName, NameEntryOutcome } from '../online/nameEntry.ts';
import type { StaticTextFrame } from '../online/stageText.ts';
import { CARET_BLINK_TICKS } from '../online/tuning.ts';
import { menuButtonLabelFrame, sceneMenuButton } from './menuButtonLabel.ts';
import { OverrideTree } from './overrideTree.ts';
import { applySetupAction, SETUP_EXPANDED, SetupOutcome, SetupWindow, setupWindowLayout, type SetupAction, type SetupWindowLayout } from './SetupWindow.ts';
import { MenuCore, type MenuKit } from './MenuCore.ts';
import { mapTargets, Trigger, type MenuTarget } from './MenuPointer.ts';
import { rollOverFilters } from './rollOver.ts';
import {
  MAIN_MENU_BACKGROUND_DEPTH,
  JOIN_CODE_BUTTON,
  MAIN_MENU_TITLE_DEPTH,
  MainMenuChild,
  MENU_TICKS_PER_SECOND,
  MenuSymbol,
  ROLL_OUT_ALPHA,
  ROLL_OVER_ALPHA,
} from './tuning.ts';

export interface MainMenuDependencies {
  readonly kit: MenuKit;
  readonly rng: Rng;
  readonly controls: FlowControls;
  readonly settings: SettingsService;
}

export function itemMatrix(matrix: Matrix): DisplayItem['matrix'] {
  const [a, b, c, d, tx, ty] = matrix;
  return [a, b, c, d, tx, ty];
}

const NO_FILTERS: readonly Filter[] = [];
const MODE_BUTTONS = [MainMenuChild.SinglePlay, MainMenuChild.CoopPlay, MainMenuChild.DeathPlay] as const;
const MENU_BUTTONS = [...MODE_BUTTONS, MainMenuChild.Options] as const;
const MENU_BUTTON_NAMES: ReadonlySet<string> = new Set(MENU_BUTTONS);
const LABELED_BUTTONS = [MainMenuChild.Options, JOIN_CODE_BUTTON.name] as const;

export const MainMenuAction = {
  Play: 'play',
  OpenSettings: 'openSettings',
  Settings: 'settings',
  EditCode: 'editCode',
} as const;

export type MainMenuAction =
  | { readonly kind: typeof MainMenuAction.Play; readonly mode: GameMode }
  | { readonly kind: typeof MainMenuAction.OpenSettings }
  | { readonly kind: typeof MainMenuAction.EditCode }
  | { readonly kind: typeof MainMenuAction.Settings; readonly action: SetupAction };

const MAIN_MENU_TARGETS: readonly MenuTarget<MainMenuAction>[] = [
  { path: [MainMenuChild.SinglePlay], trigger: Trigger.Release, action: { kind: MainMenuAction.Play, mode: GameMode.Single } },
  { path: [MainMenuChild.CoopPlay], trigger: Trigger.Release, action: { kind: MainMenuAction.Play, mode: GameMode.Coop } },
  { path: [MainMenuChild.DeathPlay], trigger: Trigger.Release, action: { kind: MainMenuAction.Play, mode: GameMode.DeathMatch } },
  { path: [MainMenuChild.Options], trigger: Trigger.Release, action: { kind: MainMenuAction.OpenSettings } },
  { path: [JOIN_CODE_BUTTON.name], trigger: Trigger.Release, action: { kind: MainMenuAction.EditCode } },
];

export interface MainMenuLayout {
  readonly items: readonly DisplayItem[];
  readonly settingsLabel: StaticTextFrame | undefined;
  readonly joinCodeLabel: StaticTextFrame | undefined;
  readonly setup: SetupWindowLayout;
}

export function mainMenuLayout(library: SymbolLibrary): MainMenuLayout {
  const rootId = library.characterId(MenuSymbol.Main);
  const selectId = library.characterId(MenuSymbol.SelectWorld);
  const items = rootId === undefined ? [] : library.frameItems(rootId, 0);
  const window = (selectId === undefined ? [] : library.frameItems(selectId, 0)).find((item) => item.name === MainMenuChild.OptionsWindow);
  const kept = items.filter(
    (item) =>
      item.depth === MAIN_MENU_BACKGROUND_DEPTH || item.depth === MAIN_MENU_TITLE_DEPTH || (item.name !== undefined && MENU_BUTTON_NAMES.has(item.name)),
  );
  const settings = items.find((item) => item.name === MainMenuChild.Options);
  const joinCode = settings ? [{ ...settings, name: JOIN_CODE_BUTTON.name, depth: JOIN_CODE_BUTTON.depth, matrix: itemMatrix(JOIN_CODE_BUTTON.matrix) }] : [];
  return {
    items: [...kept, ...joinCode, ...(window ? [window] : [])].sort((first, second) => first.depth - second.depth),
    settingsLabel: menuButtonLabelFrame(library, items, MainMenuChild.Options),
    joinCodeLabel: menuButtonLabelFrame(library, joinCode, JOIN_CODE_BUTTON.name),
    setup: setupWindowLayout(library, window),
  };
}

export function mainMenuBackdrop(library: SymbolLibrary): readonly DisplayItem[] {
  return mainMenuLayout(library).items.filter((item) => item.depth === MAIN_MENU_BACKGROUND_DEPTH);
}

export class MainMenuScreen implements Screen {
  readonly name = 'mainMenu';
  readonly ticksPerSecond = MENU_TICKS_PER_SECOND;
  private readonly core: MenuCore<MainMenuAction>;
  private readonly layout: MainMenuLayout;
  private readonly setup: SetupWindow;
  private rolledOver: { readonly name: string; readonly filters: readonly Filter[] } | undefined = undefined;
  private settingsOpen = false;
  private codeDraft: string | undefined = undefined;
  private ticks = 0;

  constructor(private readonly deps: MainMenuDependencies) {
    this.core = new MenuCore(deps.kit);
    this.layout = mainMenuLayout(deps.kit.renderer.library);
    this.setup = new SetupWindow(deps.kit.renderer.library, this.layout.setup);
  }

  get cursor(): Cursor {
    return this.core.cursor;
  }

  get settingsWindowOpen(): boolean {
    return this.settingsOpen;
  }

  get joinCodeDraft(): string | undefined {
    return this.codeDraft;
  }

  tick(): void {
    this.ticks++;
    this.core.tick(
      () => this.scene(),
      () => this.targets(),
    );
    const hovered = this.settingsOpen ? undefined : this.core.pointer.hoveredTarget?.path[0];
    this.rolledOver = hovered === undefined ? undefined : { name: hovered, filters: rollOverFilters(this.deps.rng) };
  }

  present(): void {
    this.core.present(this.scene());
  }

  idle(): void {}

  pointer(input: PointerInput): void {
    const action = this.core.handle(input, this.scene(), this.targets());
    if (this.core.pointer.hoveredTarget?.path[0] !== this.rolledOver?.name) this.rolledOver = undefined;
    if (action === undefined) return;
    this.perform(action);
    this.core.refresh(this.scene(), this.targets());
  }

  key(code: string, typed?: string): boolean {
    if (this.codeDraft === undefined) return false;
    const step = editName(this.codeDraft, code, typed === undefined ? undefined : normalizeLobbyCode(typed) || undefined, LOBBY_CODE_LENGTH);
    if (step.outcome === NameEntryOutcome.Editing) this.codeDraft = step.draft;
    else if (step.outcome === NameEntryOutcome.Confirmed) this.joinByCode(step.draft);
    else this.codeDraft = undefined;
    return true;
  }

  suspend(): void {}

  dispose(): void {}

  perform(action: MainMenuAction): void {
    const { audio } = this.deps.kit;
    const draft = this.codeDraft;
    if (action.kind !== MainMenuAction.EditCode) this.codeDraft = undefined;
    switch (action.kind) {
      case MainMenuAction.Play:
        audio.play(SoundId.Click);
        if (action.mode === GameMode.Single) this.deps.controls.selectWorld(action.mode);
        else this.deps.controls.openLobby(action.mode);
        return;
      case MainMenuAction.OpenSettings:
        audio.play(SoundId.Click);
        this.settingsOpen = true;
        this.rolledOver = undefined;
        return;
      case MainMenuAction.EditCode:
        audio.play(SoundId.Click);
        if (draft === undefined) this.codeDraft = '';
        else this.joinByCode(draft);
        return;
      case MainMenuAction.Settings:
        if (applySetupAction(this.deps.settings, action.action) === SetupOutcome.Closed) this.settingsOpen = false;
        audio.play(SoundId.Click2);
        return;
    }
  }

  targets(): readonly MenuTarget<MainMenuAction>[] {
    if (!this.settingsOpen) return MAIN_MENU_TARGETS;
    return mapTargets(this.setup.targets(), (action) => ({ kind: MainMenuAction.Settings, action }));
  }

  scene(): StageScene {
    const tree = new OverrideTree();
    const library = this.deps.kit.renderer.library;
    for (const name of LABELED_BUTTONS) {
      const rolled = this.rolledOver?.name === name ? this.rolledOver : undefined;
      const editing = name === JOIN_CODE_BUTTON.name && this.codeDraft !== undefined;
      sceneMenuButton(tree, library, { name, frame: this.labelFrame(name), text: this.labelText(name), highlighted: rolled !== undefined || editing, filters: rolled?.filters });
    }
    for (const name of MODE_BUTTONS) {
      const rolled = this.rolledOver?.name === name ? this.rolledOver : undefined;
      tree.set([name, MainMenuChild.Contents], { alpha: rolled ? ROLL_OVER_ALPHA : ROLL_OUT_ALPHA, filters: rolled?.filters ?? NO_FILTERS });
    }
    this.setup.scene(tree, this.settingsOpen, this.deps.settings.settings, (path) => this.core.pointer.buttonState(path));
    return { items: this.layout.items, overrides: tree.overrides, expand: SETUP_EXPANDED };
  }

  private labelFrame(name: (typeof LABELED_BUTTONS)[number]): StaticTextFrame | undefined {
    return name === MainMenuChild.Options ? this.layout.settingsLabel : this.layout.joinCodeLabel;
  }

  private labelText(name: (typeof LABELED_BUTTONS)[number]): string {
    if (name === MainMenuChild.Options) return t('setup.menuButton');
    if (this.codeDraft === undefined) return t('menu.joinCode');
    const caret = Math.floor(this.ticks / CARET_BLINK_TICKS) % 2 === 0 ? t('online.menu.caret') : '';
    return t('menu.joinCodeDraft', { code: `${this.codeDraft}${caret}` });
  }

  private joinByCode(typed: string): void {
    const code = normalizeLobbyCode(typed);
    this.codeDraft = undefined;
    if (code.length === LOBBY_CODE_LENGTH) this.deps.controls.joinByCode(code);
  }
}
