import type { DisplayItem, RoomIndex } from '../../../adapters/assets/schemas.ts';
import type { StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import { depthKey, type SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import { SoundId } from '../../../domain/sounds.ts';
import type { GameMode } from '../../../domain/world/GameMode.ts';
import { PlayerCharacter } from '../../../domain/world/SimulationSettings.ts';
import type { Logger } from '../../../observability/logger.ts';
import {
  optionValue,
  resetOptions,
  withCharacter,
  withOption,
  type OptionField,
} from '../../../services/menuSettings.ts';
import type { Cursor, FlowControls, PointerInput, Screen } from '../../../services/ScreenFlow.ts';
import { levelIndexFor, toLobbyOptions, withLevelIndex, type SettingsService, type UserSettings } from '../../../services/SettingsService.ts';
import { roomIdForLevel, type RoomPanel } from '../online/lobbyModel.ts';
import type { SelectWorldRoom } from '../online/LobbyRoom.ts';
import { clipBefore, placedText, staticTextFrame, textOverride, type PlacedText, type StaticTextFrame } from '../online/stageText.ts';
import type { Rect } from '../../../adapters/render/geometry/Rect.ts';
import {
  MENU_TEXT_COLOR,
  ROOM_INVITE,
  ROOM_MEMBERS,
  ROOM_NOTICE,
  ROOM_OPTIONS,
  ROOM_PROMPT_ATTACHED_DEPTH,
  ROOM_PROMPT_DEPTH,
  ROW_LABEL_COLOR,
  RoomChild,
  TextStyles,
} from '../online/tuning.ts';
import { cycleFrame } from './frameCycle.ts';
import { itemMatrix } from './MainMenuScreen.ts';
import { MenuCore, type MenuKit } from './MenuCore.ts';
import { mapTargets, Trigger, type MenuTarget } from './MenuPointer.ts';
import { ControlsOutcome, ControlsWindow, controlsWindowLayout, type ControlsAction, type ControlsWindowLayout } from './ControlsWindow.ts';
import { OverrideTree } from './overrideTree.ts';
import {
  HISCORE_NOTE,
  OPTION_INFO_CLIP_MARGIN_PX,
  MENU_TICKS_PER_SECOND,
  MenuSymbol,
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
  Controls: 'controls',
  Option: 'option',
  Character: 'character',
  Level: 'level',
  Play: 'play',
  CopyLink: 'copyLink',
} as const;

export type SelectAction =
  | { readonly kind: typeof SelectAction.Back }
  | { readonly kind: typeof SelectAction.OpenOptions }
  | { readonly kind: typeof SelectAction.CloseOptions }
  | { readonly kind: typeof SelectAction.ResetOptions }
  | { readonly kind: typeof SelectAction.OpenControls }
  | { readonly kind: typeof SelectAction.Controls; readonly action: ControlsAction }
  | { readonly kind: typeof SelectAction.Option; readonly field: OptionField; readonly value: number }
  | { readonly kind: typeof SelectAction.Character; readonly delta: number }
  | { readonly kind: typeof SelectAction.Level; readonly delta: number }
  | { readonly kind: typeof SelectAction.Play }
  | { readonly kind: typeof SelectAction.CopyLink };

export interface SelectWorldDependencies {
  readonly kit: MenuKit;
  readonly settings: SettingsService;
  readonly rooms: RoomIndex;
  readonly controls: FlowControls;
  readonly logger: Logger;
  readonly mode: GameMode;
  readonly room?: SelectWorldRoom;
}

export interface SelectWorldLayout {
  readonly items: readonly DisplayItem[];
  readonly subScreenId: number | undefined;
  readonly levelIcons: DisplayItem | undefined;
  readonly levelCount: number;
  readonly characterCount: number;
  readonly prompt: StaticTextFrame | undefined;
  readonly levelCenterX: number;
  readonly controls: ControlsWindowLayout;
  readonly optionInfoClips: readonly { readonly key: string; readonly clip: Rect }[];
}

const NEXT = 1;
const PREVIOUS = -1;
const SINGLE_FRAME = 1;
const ATTACHED_INSTANCE = 0;

const SUB = [Child.SubScreenContainer] as const;
const LEVEL = [...SUB, Child.LevelSelection] as const;
const LEVEL_ICONS = [...LEVEL, Child.LevelIcons] as const;
const OPTIONS = [Child.WindowOptions] as const;

const OWN_CARD = [...SUB, PLAYER_CHARACTER_CARD] as const;
const HIDDEN_CARD = [...SUB, SECOND_CHARACTER_CARD] as const;
const HIDDEN_CARD_LABEL = [...SUB, depthKey(SECOND_CHARACTER_LABEL_DEPTH)] as const;

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
  const optionsItem = items.find((item) => item.name === Child.WindowOptions);
  const optionsChildren = optionsItem ? library.frameItems(optionsItem.characterId, 0) : [];
  return {
    items,
    subScreenId,
    levelIcons,
    levelCount: levelIconsId === undefined ? SINGLE_FRAME : (library.sprite(levelIconsId)?.frameCount ?? SINGLE_FRAME),
    characterCount: frameCount(library, character),
    prompt: staticTextFrame(library, selectionItems.find((item) => item.depth === ROOM_PROMPT_DEPTH)),
    levelCenterX: selection?.matrix[4] ?? 0,
    controls: controlsWindowLayout(library, items),
    optionInfoClips: optionsChildren.flatMap((item) => {
      const text = library.staticText(item.characterId);
      const clip = text ? clipBefore(text, HISCORE_NOTE, OPTION_INFO_CLIP_MARGIN_PX) : undefined;
      return clip ? [{ key: depthKey(item.depth), clip }] : [];
    }),
  };
}

function buttonPath(...path: string[]): string[] {
  return [...path, Child.Button];
}


export class SelectWorldScreen implements Screen {
  readonly name = 'selectWorld';
  readonly ticksPerSecond = MENU_TICKS_PER_SECOND;
  private readonly core: MenuCore<SelectAction>;
  private readonly layout: SelectWorldLayout;
  private readonly controlsWindow: ControlsWindow;
  private optionsOpen = false;
  private controlsOpen = false;

  constructor(private readonly deps: SelectWorldDependencies) {
    this.core = new MenuCore(deps.kit);
    this.layout = selectWorldLayout(deps.kit.renderer.library, deps.mode);
    this.controlsWindow = new ControlsWindow({
      library: deps.kit.renderer.library,
      layout: this.layout.controls,
      settings: deps.settings,
      logger: deps.logger,
      ticksPerSecond: () => MENU_TICKS_PER_SECOND,
    });
  }

  get cursor(): Cursor {
    return this.core.cursor;
  }

  get levelIndex(): number {
    const shared = this.deps.room?.panel()?.levelIndex;
    return cycleFrame(shared ?? levelIndexFor(this.deps.settings.settings, this.deps.mode), 0, this.layout.levelCount);
  }

  get configurable(): boolean {
    return !this.deps.room || this.roomPanel?.configurable === true;
  }

  get shownOptions(): UserSettings {
    const panel = this.roomPanel;
    return panel ? { ...this.deps.settings.settings, ...panel.lobbyOptions } : this.deps.settings.settings;
  }

  get roomPanel(): RoomPanel | undefined {
    return this.deps.room?.panel();
  }

  get characterFrame(): number {
    return cycleFrame(this.deps.settings.settings.character, 0, this.layout.characterCount);
  }

  tick(): void {
    this.controlsWindow.tick();
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
    if (!this.controlsWindow.key(code)) return false;
    if (!this.controlsWindow.capturing) this.core.refresh(this.scene(), this.targets());
    return true;
  }

  suspend(): void {}

  dispose(): void {
    this.deps.room?.dispose();
  }

  perform(action: SelectAction): void {
    const { audio } = this.deps.kit;
    const settings = this.deps.settings;
    switch (action.kind) {
      case SelectAction.Back:
        audio.play(SoundId.Click);
        if (this.deps.room) this.deps.room.back();
        else this.deps.controls.showMainMenu();
        return;
      case SelectAction.Play:
        this.play();
        audio.play(SoundId.Click);
        return;
      case SelectAction.CopyLink:
        audio.play(SoundId.Click);
        this.deps.room?.copyLink();
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
        if (!this.configurable) return;
        this.configure(resetOptions(this.shownOptions), this.levelIndex);
        settings.update(resetOptions);
        return;
      case SelectAction.OpenControls:
        this.controlsOpen = true;
        return;
      case SelectAction.Controls:
        if (this.controlsWindow.perform(action.action) === ControlsOutcome.Closed) this.controlsOpen = false;
        return;
      case SelectAction.Option:
        if (!this.configurable) return;
        this.configure(withOption(this.shownOptions, action.field, action.value), this.levelIndex);
        settings.update((current) => withOption(current, action.field, action.value));
        return;
      case SelectAction.Character: {
        const next = cycleFrame(this.characterFrame, action.delta, this.layout.characterCount);
        const character = Object.values(PlayerCharacter).find((value) => value === next);
        if (character === undefined) return;
        settings.update((current) => withCharacter(current, character));
        this.deps.room?.characterChanged(character);
        return;
      }
      case SelectAction.Level: {
        if (!this.configurable) return;
        const next = cycleFrame(this.levelIndex, action.delta, this.layout.levelCount);
        this.configure(this.shownOptions, next);
        settings.update((current) => withLevelIndex(current, this.deps.mode, next));
        return;
      }
    }
  }

  targets(): readonly MenuTarget<SelectAction>[] {
    if (this.controlsOpen) return mapTargets(this.controlsWindow.targets(), (action) => ({ kind: SelectAction.Controls, action }));
    if (this.optionsOpen) return this.optionsTargets();
    const release = (path: readonly string[], action: SelectAction): MenuTarget<SelectAction> => ({ path, trigger: Trigger.Release, action });
    const cards = [
      release([...OWN_CARD, Child.Left], { kind: SelectAction.Character, delta: PREVIOUS }),
      release([...OWN_CARD, Child.Right], { kind: SelectAction.Character, delta: NEXT }),
    ];
    const panel = this.roomPanel;
    const configurable = this.configurable;
    const playable = !this.deps.room || panel?.canPlay === true;
    return [
      ...(configurable ? [release(buttonPath(Child.GameOptions), { kind: SelectAction.OpenOptions })] : []),
      release(buttonPath(Child.GameControls), { kind: SelectAction.OpenControls }),
      { path: [Child.Back], trigger: Trigger.Press, action: { kind: SelectAction.Back } },
      ...(configurable
        ? [release([...LEVEL, Child.Left], { kind: SelectAction.Level, delta: PREVIOUS }), release([...LEVEL, Child.Right], { kind: SelectAction.Level, delta: NEXT })]
        : []),
      ...(playable ? [release([...LEVEL_ICONS, Child.Button], { kind: SelectAction.Play })] : []),
      ...(panel ? [release([...SUB, RoomChild.Invite], { kind: SelectAction.CopyLink })] : []),
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
    this.controlsWindow.scene(tree, this.controlsOpen, (path) => this.core.pointer.buttonState(path));
    const roomItems = this.sceneRoom(tree);
    if (roomItems.length > 0) tree.set(SUB, { attach: [...(tree.at(SUB).attach ?? []), ...roomItems] });
    return { items: this.layout.items, overrides: tree.overrides, expand: SELECT_WORLD_EXPANDED };
  }

  private play(): void {
    if (this.deps.room) {
      this.deps.room.play();
      return;
    }
    const roomId = roomIdForLevel(this.deps.rooms, this.levelIndex);
    if (roomId !== undefined) this.deps.controls.startGame({ mode: this.deps.mode, roomId });
  }

  private configure(options: UserSettings, levelIndex: number): void {
    const roomId = roomIdForLevel(this.deps.rooms, levelIndex);
    if (roomId !== undefined) this.deps.room?.configure(roomId, toLobbyOptions(options));
  }

  private sceneRoom(tree: OverrideTree): DisplayItem[] {
    const panel = this.roomPanel;
    if (!panel) return [];
    const library = this.deps.kit.renderer.library;
    if (!panel.configurable) {
      tree.set([Child.GameOptions], { visible: false });
      tree.set([...LEVEL, Child.Left], { visible: false });
      tree.set([...LEVEL, Child.Right], { visible: false });
    }
    const { prompt } = this.layout;
    const promptItem = prompt
      ? placedText(library, { name: RoomChild.Prompt, depth: ROOM_PROMPT_ATTACHED_DEPTH, style: TextStyles.Prompt, anchorX: prompt.centerX, top: prompt.top })
      : undefined;
    if (promptItem) {
      tree.set([...LEVEL, depthKey(ROOM_PROMPT_DEPTH)], { visible: false });
      tree.set(LEVEL, { attach: [...(tree.at(LEVEL).attach ?? []), promptItem.item] });
      tree.set([...LEVEL, RoomChild.Prompt], textOverride(promptItem, panel.prompt, MENU_TEXT_COLOR));
    }
    const items: DisplayItem[] = [];
    const add = (placed: PlacedText | undefined, text: string, color: number): void => {
      if (!placed?.item.name) return;
      items.push(placed.item);
      tree.set([...SUB, placed.item.name], textOverride(placed, text, color));
    };
    panel.members.forEach((line, index) => {
      const style = index === 0 ? TextStyles.ListHeading : TextStyles.ListItem;
      const top = ROOM_MEMBERS.top + index * ROOM_MEMBERS.lineHeight;
      const name = `${RoomChild.Members}${index}`;
      add(placedText(library, { name, depth: ROOM_MEMBERS.depth + index, style, anchorX: ROOM_MEMBERS.left, top, width: ROOM_MEMBERS.width }), line, MENU_TEXT_COLOR);
    });
    add(placedText(library, { name: RoomChild.Invite, ...ROOM_INVITE, style: TextStyles.ListHeading }), panel.invite, MENU_TEXT_COLOR);
    const { levelCenterX } = this.layout;
    add(placedText(library, { name: RoomChild.Options, ...ROOM_OPTIONS, style: TextStyles.Small, anchorX: levelCenterX }), panel.options, ROW_LABEL_COLOR);
    if (panel.notice) add(placedText(library, { name: RoomChild.Notice, ...ROOM_NOTICE, style: TextStyles.Prompt }), panel.notice, MENU_TEXT_COLOR);
    return items;
  }

  private optionsTargets(): MenuTarget<SelectAction>[] {
    const options = OPTION_GROUPS.flatMap((group) =>
      group.buttons.map((button) => ({
        path: buttonPath(...OPTIONS, button.instance),
        trigger: Trigger.Release,
        action: { kind: SelectAction.Option, field: group.field, value: button.value } as const,
      })),
    );
    const close = { path: buttonPath(...OPTIONS, Child.Close), trigger: Trigger.Release, action: { kind: SelectAction.CloseOptions } } as const;
    const lock = { path: [...OPTIONS, Child.Lock], trigger: Trigger.Block } as const;
    if (!this.configurable) return [close, lock];
    return [{ path: buttonPath(...OPTIONS, Child.Reset), trigger: Trigger.Release, action: { kind: SelectAction.ResetOptions } }, close, ...options, lock];
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
    const settings = this.shownOptions;
    for (const group of OPTION_GROUPS) {
      const current = optionValue(settings, group.field);
      for (const button of group.buttons) {
        tree.set([...OPTIONS, button.instance, Child.Selected], { visible: current === button.value });
        this.button(tree, buttonPath(...OPTIONS, button.instance));
      }
    }
    this.windowButtons(tree, OPTIONS);
    for (const { key, clip } of this.layout.optionInfoClips) tree.set([...OPTIONS, key], { clip });
  }

  private windowButtons(tree: OverrideTree, window: readonly string[]): void {
    for (const name of [Child.Close, Child.Reset]) {
      tree.set([...window, name, Child.Selected], { visible: false });
      this.button(tree, buttonPath(...window, name));
    }
  }

}
