import type { DisplayItem, Filter, RoomIndex } from '../../../adapters/assets/schemas.ts';
import type { StageScene } from '../../../adapters/render/menu/LayeredStage.ts';
import { ButtonState, depthKey, type SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import type { Rng } from '../../../domain/math/Rng.ts';
import { SoundId } from '../../../domain/sounds.ts';
import type { OnlineMode } from '../../../net/protocol.ts';
import type { OnlineClient } from '../../../services/online/OnlineClient.ts';
import type { Cursor, FlowControls, LobbyEntry, PointerInput, Screen } from '../../../services/ScreenFlow.ts';
import { levelIndexFor, toLobbyOptions, type SettingsService } from '../../../services/SettingsService.ts';
import { t } from '../../../text/i18n.ts';
import { MenuCore, type MenuKit } from '../menu/MenuCore.ts';
import { Trigger, type MenuTarget } from '../menu/MenuPointer.ts';
import { OverrideTree } from '../menu/overrideTree.ts';
import { rollOverFilters } from '../menu/rollOver.ts';
import { menuButtonLabelFrame, sceneMenuButton } from '../menu/menuButtonLabel.ts';
import { MAIN_MENU_BACKGROUND_DEPTH, MAIN_MENU_TITLE_DEPTH, MENU_TICKS_PER_SECOND, MenuSymbol } from '../menu/tuning.ts';
import { itemMatrix } from '../menu/MainMenuScreen.ts';
import { joinList, menuStatus, roomIdForLevel, type JoinList, type JoinRow } from './lobbyModel.ts';
import { placedText, staticTextFrame, textOverride, type StaticTextFrame, type TextStyle } from './stageText.ts';
import {
  BACK_TAB_DEPTH,
  JOIN_ATTACHED_DEPTH,
  JOIN_PAGER_ATTACHED_LABEL_DEPTH,
  JOIN_PAGER_BUTTONS,
  JOIN_PAGER_DISABLED_ALPHA,
  JOIN_PAGER_LABEL,
  JOIN_PAGER_LABEL_COLOR,
  JOIN_PAGER_LABEL_DEPTH,
  type JoinPagerButton,
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
  Back: 'back',
  Join: 'join',
  Page: 'page',
} as const;

export type OnlineMenuAction =
  | { readonly kind: typeof OnlineMenuAction.Host }
  | { readonly kind: typeof OnlineMenuAction.OpenJoin }
  | { readonly kind: typeof OnlineMenuAction.CloseJoin }
  | { readonly kind: typeof OnlineMenuAction.Back }
  | { readonly kind: typeof OnlineMenuAction.Join; readonly row: JoinRow }
  | { readonly kind: typeof OnlineMenuAction.Page; readonly step: number };

const MENU_BUTTONS = [Child.Host, Child.Join] as const;
type MenuButton = (typeof MENU_BUTTONS)[number];
const MENU_BUTTON_NAMES: ReadonlySet<string> = new Set(MENU_BUTTONS);
const SELECT_WORLD_ITEMS: ReadonlySet<string> = new Set([Child.Back, Child.JoinWindow]);
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
  readonly pager: JoinPagerLayout;
}

export interface JoinPagerLayout {
  readonly template: DisplayItem | undefined;
  readonly close: DisplayItem | undefined;
  readonly label: StaticTextFrame | undefined;
  readonly labelFilters: readonly Filter[] | undefined;
}

function joinPagerLayout(library: SymbolLibrary, windowItems: readonly DisplayItem[]): JoinPagerLayout {
  const template = windowItems.find((item) => item.name === JoinWindowChild.Reset);
  const text = template ? library.frameItems(template.characterId, 0).find((item) => item.depth === JOIN_PAGER_LABEL_DEPTH) : undefined;
  const close = windowItems.find((item) => item.name === JoinWindowChild.Close);
  return { template, close, label: staticTextFrame(library, text), labelFilters: text?.filters };
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
    labels: {
      [Child.Host]: menuButtonLabelFrame(library, main, Child.Host),
      [Child.Join]: menuButtonLabelFrame(library, main, Child.Join),
    },
    title: staticTextFrame(library, byDepth(JOIN_TITLE_DEPTH)),
    info: staticTextFrame(library, byDepth(JOIN_INFO_DEPTH)),
    slots,
    pager: joinPagerLayout(library, windowItems),
  };
}

function pagerEnabled(button: JoinPagerButton, list: JoinList): boolean {
  const target = list.page + button.step;
  return target >= 0 && target < list.pages;
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
  private joinPage = 0;
  private awaitingLobby = false;
  private staleLobbyId: string | undefined = undefined;
  private result: LobbyEntry['result'];

  constructor(private readonly deps: OnlineMenuDependencies) {
    this.core = new MenuCore(deps.kit);
    this.layout = onlineMenuLayout(deps.kit.renderer.library);
    this.result = deps.entry.result;
    const { client, entry } = deps;
    this.unsubscribe = client.subscribe(() => this.observe());
    client.start();
    client.watch(entry.mode);
    if (entry.joinCode !== undefined) this.joinByCode(entry.joinCode);
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

  get waitingForLobby(): boolean {
    return this.awaitingLobby;
  }

  tick(): void {
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

  key(): boolean {
    return false;
  }

  suspend(): void {}

  dispose(): void {
    this.unsubscribe();
  }

  perform(action: OnlineMenuAction): void {
    const { audio } = this.deps.kit;
    audio.play(action.kind === OnlineMenuAction.Join || action.kind === OnlineMenuAction.CloseJoin ? SoundId.Click2 : SoundId.Click);
    if (action.kind !== OnlineMenuAction.CloseJoin) this.clearNotices();
    switch (action.kind) {
      case OnlineMenuAction.Host:
        this.host();
        return;
      case OnlineMenuAction.OpenJoin:
        this.joinOpen = true;
        this.joinPage = 0;
        return;
      case OnlineMenuAction.Page:
        this.joinPage = this.currentJoinList().page + action.step;
        return;
      case OnlineMenuAction.CloseJoin:
        this.joinOpen = false;
        return;
      case OnlineMenuAction.Back:
        this.deps.client.stop();
        this.deps.controls.showMainMenu();
        return;
      case OnlineMenuAction.Join:
        if (this.awaitingLobby) return;
        this.joiningId = action.row.lobbyId;
        this.awaitLobby();
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
      const list = this.currentJoinList();
      const pager = JOIN_PAGER_BUTTONS.filter((button) => pagerEnabled(button, list)).map((button) => ({
        path: [...WINDOW, button.name, JoinWindowChild.Button],
        trigger: Trigger.Release,
        action: { kind: OnlineMenuAction.Page, step: button.step } as const,
      }));
      return [
        { path: CLOSE, trigger: Trigger.Release, action: { kind: OnlineMenuAction.CloseJoin } },
        ...pager,
        ...rows,
        { path: [...WINDOW, JoinWindowChild.Lock], trigger: Trigger.Block },
      ];
    }
    return [
      { path: [Child.Host], trigger: Trigger.Release, action: { kind: OnlineMenuAction.Host } },
      { path: [Child.Join], trigger: Trigger.Release, action: { kind: OnlineMenuAction.OpenJoin } },
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
    const { lobby } = client;
    if (!lobby) this.staleLobbyId = undefined;
    if (client.state.error) {
      this.joiningId = undefined;
      this.awaitingLobby = false;
    }
    if (this.awaitingLobby && lobby && lobby.id !== this.staleLobbyId) {
      this.awaitingLobby = false;
      controls.enterLobby(lobby.mode);
    }
  }

  private awaitLobby(): void {
    this.awaitingLobby = true;
    this.staleLobbyId = this.deps.client.lobby?.id;
  }

  private host(): void {
    const { client, settings, rooms } = this.deps;
    const current = settings.settings;
    const roomId = roomIdForLevel(rooms, levelIndexFor(current, this.mode)) ?? rooms.rooms[0]?.id;
    if (roomId === undefined || this.awaitingLobby) return;
    this.awaitLobby();
    client.createLobby(this.mode, roomId, toLobbyOptions(current), current.character);
  }

  private joinByCode(code: string): void {
    this.awaitLobby();
    this.deps.client.joinByCode(code, this.deps.settings.settings.character);
  }

  private clearNotices(): void {
    this.result = undefined;
    this.deps.client.clearNotice();
  }

  private joinRows(): readonly JoinRow[] {
    return this.currentJoinList().rows;
  }

  private currentJoinList(): JoinList {
    const list = joinList(this.mode, this.deps.client.state, this.joiningId, JOIN_SLOTS, this.joinPage);
    this.joinPage = list.page;
    return list;
  }

  private labelText(name: MenuButton): string {
    switch (name) {
      case Child.Host:
        return t('online.menu.host');
      case Child.Join:
        return t('online.menu.join');
    }
  }

  private sceneButton(tree: OverrideTree, name: MenuButton): void {
    sceneMenuButton(tree, this.deps.kit.renderer.library, {
      name,
      frame: this.layout.labels[name],
      text: this.labelText(name),
      highlighted: this.rolledOver?.name === name,
      filters: this.rolledOver?.name === name ? this.rolledOver.filters : undefined,
    });
  }

  private sceneJoinWindow(tree: OverrideTree): void {
    tree.set(WINDOW, { visible: this.joinOpen });
    if (!this.joinOpen) return;
    for (const depth of JOIN_HIDDEN_DEPTHS) tree.set([...WINDOW, depthKey(depth)], { visible: false });
    for (const name of [JoinWindowChild.Cover, JoinWindowChild.PressKey, JoinWindowChild.Reset]) tree.set([...WINDOW, name], { visible: false });
    tree.set([...WINDOW, JoinWindowChild.Close, JoinWindowChild.Selected], { visible: false });
    tree.set(CLOSE, { buttonState: this.core.pointer.buttonState(CLOSE) });
    const list = this.currentJoinList();
    const attached = [
      this.windowText(JoinWindowChild.Title, JOIN_ATTACHED_DEPTH, TextStyles.WindowTitle, this.layout.title, t('online.join.title'), tree),
      this.windowText(JoinWindowChild.Info, JOIN_ATTACHED_DEPTH + 1, TextStyles.Small, this.layout.info, list.info, tree),
      ...this.scenePager(tree, list),
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

  private scenePager(tree: OverrideTree, list: JoinList): DisplayItem[] {
    const { template, close, label: frame, labelFilters } = this.layout.pager;
    if (!template) return [];
    const [a = 1, b = 0, c = 0, d = 1, , ty = 0] = template.matrix;
    if (close) {
      const [ca = 1, cb = 0, cc = 0, cd = 1, , cty = 0] = close.matrix;
      tree.set([...WINDOW, JoinWindowChild.Close], { matrix: itemMatrix([ca, cb, cc, cd, 0, cty]) });
    }
    if (list.pages <= 1) return [];
    const library = this.deps.kit.renderer.library;
    return JOIN_PAGER_BUTTONS.map((button) => {
      const path = [...WINDOW, button.name];
      const enabled = pagerEnabled(button, list);
      tree.set([...path, JoinWindowChild.Selected], { visible: false });
      tree.set([...path, JoinWindowChild.Button], { buttonState: enabled ? this.core.pointer.buttonState([...path, JoinWindowChild.Button]) : ButtonState.Up });
      const label = frame
        ? placedText(library, { name: JOIN_PAGER_LABEL, depth: JOIN_PAGER_ATTACHED_LABEL_DEPTH, style: TextStyles.OptionButton, anchorX: frame.centerX, top: frame.top })
        : undefined;
      tree.set(path, { ...(enabled ? {} : { alpha: JOIN_PAGER_DISABLED_ALPHA }), ...(label ? { attach: [label.item] } : {}) });
      if (label) {
        tree.set([...path, depthKey(JOIN_PAGER_LABEL_DEPTH)], { visible: false });
        tree.set([...path, JOIN_PAGER_LABEL], { ...textOverride(label, t(button.text), JOIN_PAGER_LABEL_COLOR), ...(labelFilters ? { filters: labelFilters } : {}) });
      }
      return { ...template, name: button.name, depth: button.depth, matrix: itemMatrix([a, b, c, d, button.x, ty]) };
    });
  }

  private windowText(name: string, depth: number, style: TextStyle, frame: StaticTextFrame | undefined, text: string, tree: OverrideTree): DisplayItem | undefined {
    if (!frame) return undefined;
    const placed = placedText(this.deps.kit.renderer.library, { name, depth, style, anchorX: frame.centerX, top: frame.top, width: JOIN_TEXT_WIDTH_PX });
    if (placed) tree.set([...WINDOW, name], textOverride(placed, text, WINDOW_TEXT_COLOR));
    return placed?.item;
  }
}
