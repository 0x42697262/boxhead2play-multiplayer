import type { DisplayItem, RoomIndex } from '../../../adapters/assets/schemas.ts';
import { keyCodeForCode, validKey } from '../../../adapters/input/validKeys.ts';
import type { StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import { depthKey, type SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import { SoundId } from '../../../domain/sounds.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import { PlayerCharacter } from '../../../domain/world/SimulationSettings.ts';
import type { Logger } from '../../../observability/logger.ts';
import {
  optionValue,
  resetKeys,
  resetOptions,
  withCharacter,
  withKey,
  withOption,
  type OptionField,
} from '../../../services/menuSettings.ts';
import type { Cursor, FlowControls, PointerInput, Screen } from '../../../services/ScreenFlow.ts';
import { levelIndexFor, withLevelIndex, type SettingsService } from '../../../services/SettingsService.ts';
import { t } from '../../../text/i18n.ts';
import { LogEvent } from '../../../text/logEvents.ts';
import { cycleFrame } from './frameCycle.ts';
import { KeyCapture, KeyPressOutcome, type KeyTarget } from './KeyCapture.ts';
import { itemMatrix } from './MainMenuScreen.ts';
import { MenuCore, type MenuKit } from './MenuCore.ts';
import { Trigger, type MenuTarget } from './MenuPointer.ts';
import { OverrideTree } from './overrideTree.ts';
import {
  CHANGE_KEY_PREFIX,
  CONTROL_PANEL,
  KEY_ROWS,
  KEY_TEXT_PREFIX,
  MENU_TICKS_PER_SECOND,
  MenuSymbol,
  MS_PER_SECOND,
  OPTION_GROUPS,
  PLAYER_CHARACTER_CARD,
  SECOND_CHARACTER_CARD,
  SECOND_CHARACTER_LABEL_DEPTH,
  SELECT_WORLD_BANNER_DEPTHS,
  SELECT_WORLD_EXPANDED,
  SELECT_WORLD_REMOVED_NAMES,
  SelectWorldChild as Child,
  SUB_SCREEN_SYMBOLS,
} from './tuning.ts';

export const SelectAction = {
  Back: 'back',
  OpenOptions: 'openOptions',
  CloseOptions: 'closeOptions',
  ResetOptions: 'resetOptions',
  OpenControls: 'openControls',
  CloseControls: 'closeControls',
  ResetControls: 'resetControls',
  Option: 'option',
  Character: 'character',
  Level: 'level',
  Play: 'play',
  ChangeKey: 'changeKey',
} as const;

export type SelectAction =
  | { readonly kind: typeof SelectAction.Back }
  | { readonly kind: typeof SelectAction.OpenOptions }
  | { readonly kind: typeof SelectAction.CloseOptions }
  | { readonly kind: typeof SelectAction.ResetOptions }
  | { readonly kind: typeof SelectAction.OpenControls }
  | { readonly kind: typeof SelectAction.CloseControls }
  | { readonly kind: typeof SelectAction.ResetControls }
  | { readonly kind: typeof SelectAction.Option; readonly field: OptionField; readonly value: number }
  | { readonly kind: typeof SelectAction.Character; readonly delta: number }
  | { readonly kind: typeof SelectAction.Level; readonly delta: number }
  | { readonly kind: typeof SelectAction.Play }
  | { readonly kind: typeof SelectAction.ChangeKey; readonly target: KeyTarget };

export interface SelectWorldDependencies {
  readonly kit: MenuKit;
  readonly settings: SettingsService;
  readonly rooms: RoomIndex;
  readonly controls: FlowControls;
  readonly logger: Logger;
  readonly mode: GameMode;
}

export interface SelectWorldLayout {
  readonly items: readonly DisplayItem[];
  readonly subScreenId: number | undefined;
  readonly levelIcons: DisplayItem | undefined;
  readonly levelCount: number;
  readonly characterCount: number;
  readonly pressAKeyFrames: number;
}

const NEXT = 1;
const PREVIOUS = -1;
const SINGLE_FRAME = 1;
const ATTACHED_INSTANCE = 0;

const SUB = [Child.SubScreenContainer] as const;
const LEVEL = [...SUB, Child.LevelSelection] as const;
const LEVEL_ICONS = [...LEVEL, Child.LevelIcons] as const;
const OPTIONS = [Child.WindowOptions] as const;
const CONTROLS = [Child.WindowControls] as const;
const PRESS_KEY = [...CONTROLS, Child.PressKey] as const;

const OWN_CARD = [...SUB, PLAYER_CHARACTER_CARD] as const;
const HIDDEN_CARD = [...SUB, SECOND_CHARACTER_CARD] as const;
const HIDDEN_CARD_LABEL = [...SUB, depthKey(SECOND_CHARACTER_LABEL_DEPTH)] as const;
const OWN_KEYS = [...CONTROLS, CONTROL_PANEL] as const;

function frameCount(library: SymbolLibrary, item: DisplayItem | undefined): number {
  return (item ? library.sprite(item.characterId)?.frameCount : undefined) ?? SINGLE_FRAME;
}

export function selectWorldLayout(library: SymbolLibrary, mode: GameMode): SelectWorldLayout {
  const rootId = library.characterId(MenuSymbol.SelectWorld);
  const subScreenId = library.characterId(SUB_SCREEN_SYMBOLS[mode]);
  const levelIconsId = library.characterId(MenuSymbol.LevelIcons);
  const items = (rootId === undefined ? [] : library.frameItems(rootId, 0)).filter(
    (item) => !SELECT_WORLD_BANNER_DEPTHS.has(item.depth) && !(item.name !== undefined && SELECT_WORLD_REMOVED_NAMES.has(item.name)),
  );
  const selection = subScreenId === undefined ? undefined : library.findChild(subScreenId, Child.LevelSelection);
  const selectionItems = selection ? library.frameItems(selection.characterId, 0) : [];
  const shadow = selectionItems.find((item) => item.name === Child.Shadow);
  const nextDepth = Math.max(0, ...selectionItems.map((item) => item.depth)) + 1;
  const levelIcons: DisplayItem | undefined =
    levelIconsId === undefined
      ? undefined
      : {
          depth: nextDepth,
          characterId: levelIconsId,
          instance: ATTACHED_INSTANCE,
          matrix: itemMatrix([1, 0, 0, 1, 0, 0]),
          name: Child.LevelIcons,
          ...(shadow?.filters ? { filters: shadow.filters } : {}),
        };
  const card = subScreenId === undefined ? undefined : library.findChild(subScreenId, PLAYER_CHARACTER_CARD);
  const character = card ? library.findChild(card.characterId, Child.Character) : undefined;
  const controls = library.resolve(items, PRESS_KEY, undefined);
  const pressAKey = controls ? library.findChild(controls.item.characterId, Child.PressAKey) : undefined;
  return {
    items,
    subScreenId,
    levelIcons,
    levelCount: levelIconsId === undefined ? SINGLE_FRAME : (library.sprite(levelIconsId)?.frameCount ?? SINGLE_FRAME),
    characterCount: frameCount(library, character),
    pressAKeyFrames: frameCount(library, pressAKey),
  };
}

function buttonPath(...path: string[]): string[] {
  return [...path, Child.Button];
}

function keyButtonPath(variable: string): string[] {
  return [...OWN_KEYS, `${CHANGE_KEY_PREFIX}${variable}`];
}

export class SelectWorldScreen implements Screen {
  readonly name = 'selectWorld';
  readonly ticksPerSecond = MENU_TICKS_PER_SECOND;
  private readonly core: MenuCore<SelectAction>;
  private readonly layout: SelectWorldLayout;
  private readonly capture = new KeyCapture();
  private optionsOpen = false;
  private controlsOpen = false;
  private ticks = 0;
  private captureTick = 0;

  constructor(private readonly deps: SelectWorldDependencies) {
    this.core = new MenuCore(deps.kit);
    this.layout = selectWorldLayout(deps.kit.renderer.library, deps.mode);
  }

  get cursor(): Cursor {
    return this.core.cursor;
  }

  get levelIndex(): number {
    return cycleFrame(levelIndexFor(this.deps.settings.settings, this.deps.mode), 0, this.layout.levelCount);
  }

  get characterFrame(): number {
    return cycleFrame(this.deps.settings.settings.character, 0, this.layout.characterCount);
  }

  tick(): void {
    this.ticks++;
    this.core.tick(
      () => this.scene(),
      () => this.targets(),
    );
  }

  present(): void {
    this.core.present(this.scene());
  }

  idle(): void {}

  pointer(input: PointerInput): void {
    const action = this.core.handle(input, this.scene(), this.targets());
    if (action === undefined) return;
    this.perform(action);
    this.core.refresh(this.scene(), this.targets());
  }

  key(code: string): boolean {
    if (!this.capture.active) return false;
    const result = this.capture.press(keyCodeForCode(code), this.nowMs());
    if (result.outcome === KeyPressOutcome.Assigned) {
      const { field } = result.target;
      this.deps.settings.update((settings) => withKey(settings, field, result.keyCode));
      this.deps.logger.info(LogEvent.KeyRebound, { field, keyCode: result.keyCode });
    }
    if (!this.capture.active) this.core.refresh(this.scene(), this.targets());
    return true;
  }

  suspend(): void {}

  dispose(): void {}

  perform(action: SelectAction): void {
    const { audio } = this.deps.kit;
    const settings = this.deps.settings;
    switch (action.kind) {
      case SelectAction.Back:
        audio.play(SoundId.Click);
        if (this.deps.mode === GameMode.Single) this.deps.controls.showMainMenu();
        else this.deps.controls.openLobby(this.deps.mode);
        return;
      case SelectAction.Play:
        this.play();
        audio.play(SoundId.Click);
        return;
      default:
        audio.play(SoundId.Click2);
    }
    switch (action.kind) {
      case SelectAction.OpenOptions:
        this.optionsOpen = true;
        return;
      case SelectAction.CloseOptions:
        this.optionsOpen = false;
        return;
      case SelectAction.ResetOptions:
        settings.update(resetOptions);
        return;
      case SelectAction.OpenControls:
        this.controlsOpen = true;
        return;
      case SelectAction.CloseControls:
        this.controlsOpen = false;
        return;
      case SelectAction.ResetControls:
        settings.update(resetKeys);
        return;
      case SelectAction.Option:
        settings.update((current) => withOption(current, action.field, action.value));
        return;
      case SelectAction.Character: {
        const next = cycleFrame(this.characterFrame, action.delta, this.layout.characterCount);
        const character = Object.values(PlayerCharacter).find((value) => value === next);
        if (character !== undefined) settings.update((current) => withCharacter(current, character));
        return;
      }
      case SelectAction.Level: {
        const next = cycleFrame(this.levelIndex, action.delta, this.layout.levelCount);
        settings.update((current) => withLevelIndex(current, this.deps.mode, next));
        return;
      }
      case SelectAction.ChangeKey:
        this.capture.begin(action.target);
        this.captureTick = this.ticks;
        return;
    }
  }

  targets(): readonly MenuTarget<SelectAction>[] {
    if (this.capture.active) return [{ path: [...PRESS_KEY, Child.Lock], trigger: Trigger.Block }];
    if (this.controlsOpen) return this.controlsTargets();
    if (this.optionsOpen) return this.optionsTargets();
    const release = (path: readonly string[], action: SelectAction): MenuTarget<SelectAction> => ({ path, trigger: Trigger.Release, action });
    const cards = [
      release([...OWN_CARD, Child.Left], { kind: SelectAction.Character, delta: PREVIOUS }),
      release([...OWN_CARD, Child.Right], { kind: SelectAction.Character, delta: NEXT }),
    ];
    return [
      release(buttonPath(Child.GameOptions), { kind: SelectAction.OpenOptions }),
      release(buttonPath(Child.GameControls), { kind: SelectAction.OpenControls }),
      { path: [Child.Back], trigger: Trigger.Press, action: { kind: SelectAction.Back } },
      release([...LEVEL, Child.Left], { kind: SelectAction.Level, delta: PREVIOUS }),
      release([...LEVEL, Child.Right], { kind: SelectAction.Level, delta: NEXT }),
      release([...LEVEL_ICONS, Child.Button], { kind: SelectAction.Play }),
      ...cards,
    ];
  }

  scene(): StageScene {
    const tree = new OverrideTree();
    this.sceneSubScreen(tree);
    for (const name of [Child.GameOptions, Child.GameControls]) {
      tree.set([name, Child.Selected], { visible: false });
      this.button(tree, buttonPath(name));
    }
    this.sceneOptions(tree);
    this.sceneControls(tree);
    return { items: this.layout.items, overrides: tree.overrides, expand: SELECT_WORLD_EXPANDED };
  }

  private play(): void {
    const index = this.levelIndex;
    const room = this.deps.rooms.rooms.find((entry) => entry.iconFrame === index);
    if (!room) return;
    const selection = { mode: this.deps.mode, roomId: room.id };
    if (this.deps.mode === GameMode.Single) this.deps.controls.startGame(selection);
    else this.deps.controls.hostLobby(selection);
  }

  private optionsTargets(): MenuTarget<SelectAction>[] {
    const options = OPTION_GROUPS.flatMap((group) =>
      group.buttons.map((button) => ({
        path: buttonPath(...OPTIONS, button.instance),
        trigger: Trigger.Release,
        action: { kind: SelectAction.Option, field: group.field, value: button.value } as const,
      })),
    );
    return [
      { path: buttonPath(...OPTIONS, Child.Reset), trigger: Trigger.Release, action: { kind: SelectAction.ResetOptions } },
      { path: buttonPath(...OPTIONS, Child.Close), trigger: Trigger.Release, action: { kind: SelectAction.CloseOptions } },
      ...options,
      { path: [...OPTIONS, Child.Lock], trigger: Trigger.Block },
    ];
  }

  private controlsTargets(): MenuTarget<SelectAction>[] {
    const keys = KEY_ROWS.map((row) => ({
      path: keyButtonPath(row.variable),
      trigger: Trigger.Release,
      action: { kind: SelectAction.ChangeKey, target: { field: row.field } } as const,
    }));
    return [
      { path: buttonPath(...CONTROLS, Child.Reset), trigger: Trigger.Release, action: { kind: SelectAction.ResetControls } },
      { path: buttonPath(...CONTROLS, Child.Close), trigger: Trigger.Release, action: { kind: SelectAction.CloseControls } },
      { path: [...CONTROLS, Child.TwoPlayerCover], trigger: Trigger.Block },
      ...keys,
      { path: [...CONTROLS, Child.Lock], trigger: Trigger.Block },
    ];
  }

  private button(tree: OverrideTree, path: readonly string[]): void {
    tree.set(path, { buttonState: this.core.pointer.buttonState(path) });
  }

  private sceneSubScreen(tree: OverrideTree): void {
    const { subScreenId, levelIcons } = this.layout;
    if (subScreenId !== undefined) tree.set(SUB, { characterId: subScreenId, matrix: [1, 0, 0, 1, 0, 0] });
    tree.set([...LEVEL, Child.Shadow], { visible: false });
    if (levelIcons) tree.set(LEVEL, { attach: [levelIcons] });
    tree.set(LEVEL_ICONS, { frame: this.levelIndex });
    tree.set([...LEVEL_ICONS, Child.ViewHighScore], { visible: false });
    tree.set([...LEVEL_ICONS, Child.Exclusive], { visible: false });
    this.button(tree, [...LEVEL_ICONS, Child.Button]);
    this.button(tree, [...LEVEL, Child.Left]);
    this.button(tree, [...LEVEL, Child.Right]);
    tree.set([...OWN_CARD, Child.Character], { frame: this.characterFrame });
    this.button(tree, [...OWN_CARD, Child.Left]);
    this.button(tree, [...OWN_CARD, Child.Right]);
    tree.set(HIDDEN_CARD, { visible: false });
    tree.set(HIDDEN_CARD_LABEL, { visible: false });
  }

  private sceneOptions(tree: OverrideTree): void {
    tree.set(OPTIONS, { visible: this.optionsOpen });
    if (!this.optionsOpen) return;
    const settings = this.deps.settings.settings;
    for (const group of OPTION_GROUPS) {
      const current = optionValue(settings, group.field);
      for (const button of group.buttons) {
        tree.set([...OPTIONS, button.instance, Child.Selected], { visible: current === button.value });
        this.button(tree, buttonPath(...OPTIONS, button.instance));
      }
    }
    this.windowButtons(tree, OPTIONS);
  }

  private sceneControls(tree: OverrideTree): void {
    tree.set(CONTROLS, { visible: this.controlsOpen });
    if (!this.controlsOpen) return;
    tree.set([...CONTROLS, Child.TwoPlayerCover], { visible: true });
    const keys = this.deps.settings.settings.keys;
    for (const row of KEY_ROWS) {
      const key = validKey(keys[row.field]);
      tree.set([...OWN_KEYS, `${KEY_TEXT_PREFIX}${row.variable}`], { text: key ? t(key.name) : '' });
      this.button(tree, keyButtonPath(row.variable));
    }
    this.windowButtons(tree, CONTROLS);
    tree.set(PRESS_KEY, { visible: this.capture.active });
    if (!this.capture.active) return;
    const display = this.capture.display(this.nowMs());
    const blink = (this.ticks - this.captureTick) % this.layout.pressAKeyFrames;
    tree.set([...PRESS_KEY, Child.PressAKey], { frame: blink, alpha: display.pressAKeyAlpha });
    tree.set([...PRESS_KEY, Child.InvalidKey], { visible: display.invalidVisible, alpha: display.invalidAlpha });
  }

  private windowButtons(tree: OverrideTree, window: readonly string[]): void {
    for (const name of [Child.Close, Child.Reset]) {
      tree.set([...window, name, Child.Selected], { visible: false });
      this.button(tree, buttonPath(...window, name));
    }
  }

  private nowMs(): number {
    return (this.ticks * MS_PER_SECOND) / MENU_TICKS_PER_SECOND;
  }
}
