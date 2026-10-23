import type { DisplayItem, Filter, RoomIndex } from '../../../adapters/assets/schemas.ts';
import type { StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import { ButtonState, depthKey, type SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import type { Rng } from '../../../domain/math/Rng.ts';
import { SoundId } from '../../../domain/sounds.ts';
import type { OnlineMode } from '../../../net/protocol.ts';
import { PLAYER_NAME_MAX_LENGTH } from '../../../net/tuning.ts';
import { withPlayerName } from '../../../services/menuSettings.ts';
import type { OnlineClient } from '../../../services/online/OnlineClient.ts';
import type { Cursor, FlowControls, LobbyEntry, PointerInput, Screen } from '../../../services/ScreenFlow.ts';
import { levelIndexFor, toLobbyOptions, type SettingsService } from '../../../services/SettingsService.ts';
import { t } from '../../../text/i18n.ts';
import { MenuCore, type MenuKit } from '../menu/MenuCore.ts';
import { Trigger, type MenuTarget } from '../menu/MenuPointer.ts';
import { OverrideTree } from '../menu/overrideTree.ts';
import { rollOverFilters } from '../menu/rollOver.ts';
import { MAIN_MENU_BACKGROUND_DEPTH, MAIN_MENU_TITLE_DEPTH, MENU_TICKS_PER_SECOND, MenuSymbol, ROLL_OUT_ALPHA, ROLL_OVER_ALPHA } from '../menu/tuning.ts';
import { joinList, menuStatus, roomIdForLevel, type JoinRow } from './lobbyModel.ts';
import { editName, NameEntryOutcome } from './nameEntry.ts';
import { placedText, staticTextFrame, textOverride, type StaticTextFrame, type TextStyle } from './stageText.ts';
import {
  ATTACHED_LABEL_DEPTH,
  BACK_TAB_DEPTH,
  CARET_BLINK_TICKS,
  JOIN_ATTACHED_DEPTH,
  JOIN_HIDDEN_DEPTHS,
  JOIN_INFO_DEPTH,
  JOIN_LABEL_CELL_WIDTH_PX,
  JOIN_PANELS,
  JOIN_ROW_ATTACHED_DEPTH,
  JOIN_ROWS,
  JOIN_SLOTS,
  JOIN_TEXT_WIDTH_PX,
  JOIN_TITLE_DEPTH,
  JoinWindowChild,
  MENU_LABEL_DEPTH,
  MENU_LABEL_TOP_OFFSET_PX,
  MENU_TEXT_COLOR,
  OnlineMenuChild as Child,
  ROW_LABEL_COLOR,
  STATUS_TEXT,
  TextStyles,
  WINDOW_TEXT_COLOR,
} from './tuning.ts';

export interface OnlineMenuDependencies {
  readonly kit: MenuKit;
  readonly rng: Rng;
  readonly client: OnlineClient;
  readonly settings: SettingsService;
  readonly rooms: RoomIndex;
  readonly controls: FlowControls;
  readonly entry: LobbyEntry;
}

export const OnlineMenuAction = {
  Host: 'host',
  OpenJoin: 'openJoin',
  CloseJoin: 'closeJoin',
  EditName: 'editName',
  Back: 'back',
  Join: 'join',
} as const;

export type OnlineMenuAction =
  | { readonly kind: typeof OnlineMenuAction.Host }
  | { readonly kind: typeof OnlineMenuAction.OpenJoin }
  | { readonly kind: typeof OnlineMenuAction.CloseJoin }
  | { readonly kind: typeof OnlineMenuAction.EditName }
  | { readonly kind: typeof OnlineMenuAction.Back }
  | { readonly kind: typeof OnlineMenuAction.Join; readonly row: JoinRow };

const MENU_BUTTONS = [Child.Host, Child.Join, Child.Name] as const;
type MenuButton = (typeof MENU_BUTTONS)[number];
const MENU_BUTTON_NAMES: ReadonlySet<string> = new Set(MENU_BUTTONS);
const SELECT_WORLD_ITEMS: ReadonlySet<string> = new Set([Child.Back, Child.JoinWindow]);
const NO_FILTERS: readonly Filter[] = [];
const WINDOW = [Child.JoinWindow] as const;
const CLOSE = [...WINDOW, JoinWindowChild.Close, JoinWindowChild.Button] as const;

export interface JoinRowSlot {
  readonly panel: string;
  readonly button: string;
  readonly text: string;
  readonly labelDepth: number;
  readonly label: StaticTextFrame | undefined;
}

export interface OnlineMenuLayout {
  readonly items: readonly DisplayItem[];
  readonly labels: Readonly<Record<MenuButton, StaticTextFrame | undefined>>;
  readonly title: StaticTextFrame | undefined;
  readonly info: StaticTextFrame | undefined;
  readonly slots: readonly JoinRowSlot[];
}

function contentsLabel(library: SymbolLibrary, items: readonly DisplayItem[], name: string): StaticTextFrame | undefined {
  const button = items.find((item) => item.name === name);
  const contents = button ? library.findChild(button.characterId, Child.Contents) : undefined;
  const label = contents ? library.frameItems(contents.characterId, 0).find((item) => item.depth === MENU_LABEL_DEPTH) : undefined;
  return staticTextFrame(library, label);
}

export function onlineMenuLayout(library: SymbolLibrary): OnlineMenuLayout {
  const mainId = library.characterId(MenuSymbol.Main);
  const selectId = library.characterId(MenuSymbol.SelectWorld);
  const main = mainId === undefined ? [] : library.frameItems(mainId, 0);
  const select = selectId === undefined ? [] : library.frameItems(selectId, 0);
  const items = [
    ...main.filter(
      (item) => item.depth === MAIN_MENU_BACKGROUND_DEPTH || item.depth === MAIN_MENU_TITLE_DEPTH || (item.name !== undefined && MENU_BUTTON_NAMES.has(item.name)),
    ),
    ...select.filter((item) => item.depth === BACK_TAB_DEPTH || (item.name !== undefined && SELECT_WORLD_ITEMS.has(item.name))),
  ].sort((first, second) => first.depth - second.depth);
  const window = items.find((item) => item.name === Child.JoinWindow);
  const windowItems = window ? library.frameItems(window.characterId, 0) : [];
  const byDepth = (depth: number): DisplayItem | undefined => windowItems.find((item) => item.depth === depth);
  const panelItems = (panel: string): readonly DisplayItem[] => {
    const item = windowItems.find((child) => child.name === panel);
    return item ? library.frameItems(item.characterId, 0) : [];
  };
  const slots = JOIN_PANELS.flatMap((panel) => {
    const children = panelItems(panel);
    return JOIN_ROWS.map((row) => ({ panel, ...row, label: staticTextFrame(library, children.find((item) => item.depth === row.labelDepth)) }));
  });
  return {
    items,
    labels: { [Child.Host]: contentsLabel(library, main, Child.Host), [Child.Join]: contentsLabel(library, main, Child.Join), [Child.Name]: contentsLabel(library, main, Child.Name) },
    title: staticTextFrame(library, byDepth(JOIN_TITLE_DEPTH)),
    info: staticTextFrame(library, byDepth(JOIN_INFO_DEPTH)),
    slots,
  };
}

export class OnlineMenuScreen implements Screen {
  readonly name = 'onlineMenu';
  readonly ticksPerSecond = MENU_TICKS_PER_SECOND;
  private readonly core: MenuCore<OnlineMenuAction>;
  private readonly layout: OnlineMenuLayout;
  private readonly unsubscribe: () => void;
  private rolledOver: { readonly name: string; readonly filters: readonly Filter[] } | undefined = undefined;
  private joinOpen = false;
  private joiningId: string | undefined = undefined;
  private awaitingLobby = false;
  private draft: string | undefined = undefined;
  private result: LobbyEntry['result'];
  private ticks = 0;

  constructor(private readonly deps: OnlineMenuDependencies) {
    this.core = new MenuCore(deps.kit);
    this.layout = onlineMenuLayout(deps.kit.renderer.library);
    this.result = deps.entry.result;
    const { client, entry } = deps;
    this.unsubscribe = client.subscribe(() => this.observe());
    client.start();
    client.watch(entry.mode);
  }

  get cursor(): Cursor {
    return this.core.cursor;
  }

  get mode(): OnlineMode {
    return this.deps.entry.mode;
  }

  get joinWindowOpen(): boolean {
    return this.joinOpen;
  }

  get nameDraft(): string | undefined {
    return this.draft;
  }

  tick(): void {
    this.ticks++;
    this.core.tick(
      () => this.scene(),
      () => this.targets(),
    );
    const hovered = this.core.pointer.hoveredTarget?.path;
    const name = hovered?.length === 1 && MENU_BUTTON_NAMES.has(hovered[0] ?? '') ? hovered[0] : undefined;
    this.rolledOver = name === undefined ? undefined : { name, filters: rollOverFilters(this.deps.rng) };
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
    if (this.draft === undefined) return false;
    const step = editName(this.draft, code, typed, PLAYER_NAME_MAX_LENGTH);
    if (step.outcome === NameEntryOutcome.Editing) this.draft = step.draft;
    else if (step.outcome === NameEntryOutcome.Confirmed) this.saveName(step.draft);
    else this.draft = undefined;
    return true;
  }

  suspend(): void {}

  dispose(): void {
    this.unsubscribe();
  }

  perform(action: OnlineMenuAction): void {
    const { audio } = this.deps.kit;
    if (this.draft !== undefined && action.kind !== OnlineMenuAction.EditName) this.saveName(this.draft);
    audio.play(action.kind === OnlineMenuAction.Join || action.kind === OnlineMenuAction.CloseJoin ? SoundId.Click2 : SoundId.Click);
    if (action.kind !== OnlineMenuAction.CloseJoin) this.clearNotices();
    switch (action.kind) {
      case OnlineMenuAction.Host:
        this.host();
        return;
      case OnlineMenuAction.OpenJoin:
        this.joinOpen = true;
        return;
      case OnlineMenuAction.CloseJoin:
        this.joinOpen = false;
        this.joiningId = undefined;
        this.awaitingLobby = false;
        return;
      case OnlineMenuAction.EditName:
        this.draft = this.draft === undefined ? this.deps.settings.settings.playerName : undefined;
        return;
      case OnlineMenuAction.Back:
        this.deps.client.stop();
        this.deps.controls.showMainMenu();
        return;
      case OnlineMenuAction.Join:
        this.joiningId = action.row.lobbyId;
        this.awaitingLobby = true;
        this.deps.client.joinLobby(action.row.lobbyId, this.deps.settings.settings.character, action.row.running);
        return;
    }
  }

  targets(): readonly MenuTarget<OnlineMenuAction>[] {
    if (this.joinOpen) {
      const rows = this.joinRows()
        .map((row, index) => ({ row, slot: this.layout.slots[index] }))
        .filter(({ row, slot }) => row.joinable && slot !== undefined)
        .map(({ row, slot }) => ({ path: [...WINDOW, slot?.panel ?? '', slot?.button ?? ''], trigger: Trigger.Release, action: { kind: OnlineMenuAction.Join, row } as const }));
      return [
        { path: CLOSE, trigger: Trigger.Release, action: { kind: OnlineMenuAction.CloseJoin } },
        ...rows,
        { path: [...WINDOW, JoinWindowChild.Lock], trigger: Trigger.Block },
      ];
    }
    return [
      { path: [Child.Host], trigger: Trigger.Release, action: { kind: OnlineMenuAction.Host } },
      { path: [Child.Join], trigger: Trigger.Release, action: { kind: OnlineMenuAction.OpenJoin } },
      { path: [Child.Name], trigger: Trigger.Release, action: { kind: OnlineMenuAction.EditName } },
      { path: [Child.Back], trigger: Trigger.Press, action: { kind: OnlineMenuAction.Back } },
    ];
  }

  scene(): StageScene {
    const tree = new OverrideTree();
    for (const name of MENU_BUTTONS) this.sceneButton(tree, name);
    this.sceneJoinWindow(tree);
    const status = placedText(this.deps.kit.renderer.library, { name: Child.Status, ...STATUS_TEXT, style: TextStyles.Prompt });
    if (status) tree.set([Child.Status], textOverride(status, menuStatus(this.mode, this.deps.client.state, this.result), MENU_TEXT_COLOR));
    return { items: status ? [...this.layout.items, status.item] : this.layout.items, overrides: tree.overrides, expand: new Set([Child.JoinWindow]) };
  }

  private observe(): void {
    const { client, controls } = this.deps;
    if (client.state.error) {
      this.joiningId = undefined;
      this.awaitingLobby = false;
    }
    if (this.awaitingLobby && client.lobby) {
      this.awaitingLobby = false;
      controls.enterLobby(this.mode);
    }
  }

  private host(): void {
    const { client, settings, rooms } = this.deps;
    const current = settings.settings;
    const roomId = roomIdForLevel(rooms, levelIndexFor(current, this.mode)) ?? rooms.rooms[0]?.id;
    if (roomId === undefined) return;
    this.awaitingLobby = true;
    client.createLobby(this.mode, roomId, toLobbyOptions(current), current.character);
  }

  private saveName(name: string): void {
    this.draft = undefined;
    const updated = this.deps.settings.update((settings) => withPlayerName(settings, name));
    this.deps.client.rename(updated.playerName);
  }

  private clearNotices(): void {
    this.result = undefined;
    this.deps.client.clearNotice();
  }

  private joinRows(): readonly JoinRow[] {
    return joinList(this.mode, this.deps.client.state, this.joiningId, JOIN_SLOTS).rows;
  }

  private labelText(name: MenuButton): string {
    switch (name) {
      case Child.Host:
        return t('online.menu.host');
      case Child.Join:
        return t('online.menu.join');
      case Child.Name: {
        if (this.draft === undefined) return t('online.menu.name', { name: (this.deps.settings.settings.playerName || t('online.menu.noName')).toUpperCase() });
        const caret = Math.floor(this.ticks / CARET_BLINK_TICKS) % 2 === 0 ? t('online.menu.caret') : '';
        return t('online.menu.name', { name: `${this.draft.toUpperCase()}${caret}` });
      }
    }
  }

  private sceneButton(tree: OverrideTree, name: MenuButton): void {
    const rolled = this.rolledOver?.name === name || (name === Child.Name && this.draft !== undefined);
    const frame = this.layout.labels[name];
    const label = frame
      ? placedText(this.deps.kit.renderer.library, {
          name: Child.Label,
          depth: ATTACHED_LABEL_DEPTH,
          style: TextStyles.MenuLabel,
          anchorX: frame.centerX,
          top: frame.top + MENU_LABEL_TOP_OFFSET_PX,
        })
      : undefined;
    tree.set([name, Child.Contents], {
      alpha: rolled ? ROLL_OVER_ALPHA : ROLL_OUT_ALPHA,
      filters: this.rolledOver?.name === name ? this.rolledOver.filters : NO_FILTERS,
      ...(label ? { attach: [label.item] } : {}),
    });
    if (!label) return;
    tree.set([name, Child.Contents, depthKey(MENU_LABEL_DEPTH)], { visible: false });
    tree.set([name, Child.Contents, Child.Label], textOverride(label, this.labelText(name), MENU_TEXT_COLOR));
  }

  private sceneJoinWindow(tree: OverrideTree): void {
    tree.set(WINDOW, { visible: this.joinOpen });
    if (!this.joinOpen) return;
    for (const depth of JOIN_HIDDEN_DEPTHS) tree.set([...WINDOW, depthKey(depth)], { visible: false });
    for (const name of [JoinWindowChild.Cover, JoinWindowChild.PressKey, JoinWindowChild.Reset]) tree.set([...WINDOW, name], { visible: false });
    tree.set([...WINDOW, JoinWindowChild.Close, JoinWindowChild.Selected], { visible: false });
    tree.set(CLOSE, { buttonState: this.core.pointer.buttonState(CLOSE) });
    const list = joinList(this.mode, this.deps.client.state, this.joiningId, JOIN_SLOTS);
    const attached = [
      this.windowText(JoinWindowChild.Title, JOIN_ATTACHED_DEPTH, TextStyles.WindowTitle, this.layout.title, t('online.join.title'), tree),
      this.windowText(JoinWindowChild.Info, JOIN_ATTACHED_DEPTH + 1, TextStyles.Small, this.layout.info, list.info, tree),
    ].filter((item): item is DisplayItem => item !== undefined);
    tree.set(WINDOW, { attach: attached });
    const perPanel = new Map<string, DisplayItem[]>();
    this.layout.slots.forEach((slot, index) => {
      const row = list.rows[index];
      const path = [...WINDOW, slot.panel];
      tree.set([...path, depthKey(slot.labelDepth)], { visible: false });
      tree.set([...path, slot.text], { text: row?.action ?? '' });
      tree.set([...path, slot.button], { buttonState: row?.joinable ? this.core.pointer.buttonState([...path, slot.button]) : ButtonState.Up });
      if (!row || !slot.label) return;
      const name = `${JoinWindowChild.RowLabelPrefix}${index}`;
      const label = placedText(this.deps.kit.renderer.library, {
        name,
        depth: JOIN_ROW_ATTACHED_DEPTH + index,
        style: TextStyles.RowLabel,
        anchorX: slot.label.left,
        top: slot.label.top,
        width: JOIN_LABEL_CELL_WIDTH_PX,
      });
      if (!label) return;
      const items = perPanel.get(slot.panel) ?? [];
      items.push(label.item);
      perPanel.set(slot.panel, items);
      tree.set([...path, name], { ...textOverride(label, row.label, ROW_LABEL_COLOR), clip: label.bounds });
    });
    for (const [panel, items] of perPanel) tree.set([...WINDOW, panel], { attach: items });
  }

  private windowText(name: string, depth: number, style: TextStyle, frame: StaticTextFrame | undefined, text: string, tree: OverrideTree): DisplayItem | undefined {
    if (!frame) return undefined;
    const placed = placedText(this.deps.kit.renderer.library, { name, depth, style, anchorX: frame.centerX, top: frame.top, width: JOIN_TEXT_WIDTH_PX });
    if (placed) tree.set([...WINDOW, name], textOverride(placed, text, WINDOW_TEXT_COLOR));
    return placed?.item;
  }
}
