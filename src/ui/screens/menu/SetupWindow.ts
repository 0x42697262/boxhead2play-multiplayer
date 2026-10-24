import type { DisplayItem, Filter } from '../../../adapters/assets/schemas.ts';
import type { Matrix } from '../../../adapters/render/geometry/Matrix.ts';
import { depthKey, type ButtonState, type SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import type { GraphicsQuality } from '../../../services/graphicsQuality.ts';
import { resetSetup, withBlood, withFrameRate, withGraphics, withScreenShake, withShowPing, withSoundVolume } from '../../../services/menuSettings.ts';
import type { FrameRate } from '../../../services/SettingsService.ts';
import type { SettingsService, UserSettings } from '../../../services/SettingsService.ts';
import { t } from '../../../text/i18n.ts';
import { placedText, staticTextFrame, textOverride, type StaticTextFrame, type TextPlacement } from '../online/stageText.ts';
import { MENU_TEXT_COLOR, TextStyles, WINDOW_TEXT_COLOR } from '../online/tuning.ts';
import { itemMatrix } from './MainMenuScreen.ts';
import { Trigger, type MenuTarget } from './MenuPointer.ts';
import type { OverrideTree } from './overrideTree.ts';
import {
  BLOOD_ROW,
  FRAME_RATE_ROW,
  PING_ROW,
  GRAPHICS_ROW,
  MainMenuChild,
  SETUP_ATTACHED_DEPTH,
  SETUP_ATTACHED_LABEL_DEPTH,
  SETUP_BUTTON_LABEL_DEPTH,
  SETUP_INFO_WIDTH_PX,
  SETUP_TITLE_CENTER_X,
  SETUP_TITLE_DEPTH,
  SETUP_WINDOW_BACKGROUND_DEPTH,
  SHAKE_ROW,
  SetupWindowChild as Child,
  VOLUME_ROW,
  type SetupButtonSpec,
  type SetupRowSpec,
} from './tuning.ts';

export const SetupAction = {
  Close: 'close',
  Reset: 'reset',
  Graphics: 'graphics',
  Volume: 'volume',
  ScreenShake: 'screenShake',
  Blood: 'blood',
  FrameRate: 'frameRate',
  Ping: 'ping',
} as const;

export type SetupAction =
  | { readonly kind: typeof SetupAction.Close }
  | { readonly kind: typeof SetupAction.Reset }
  | { readonly kind: typeof SetupAction.Graphics; readonly value: GraphicsQuality }
  | { readonly kind: typeof SetupAction.Volume; readonly value: number }
  | { readonly kind: typeof SetupAction.ScreenShake; readonly value: boolean }
  | { readonly kind: typeof SetupAction.Blood; readonly value: boolean }
  | { readonly kind: typeof SetupAction.FrameRate; readonly value: FrameRate }
  | { readonly kind: typeof SetupAction.Ping; readonly value: boolean };

export interface SetupButtonLayout<Value> {
  readonly spec: SetupButtonSpec<Value>;
  readonly matrix: Matrix | undefined;
  readonly label: StaticTextFrame | undefined;
  readonly labelFilters: readonly Filter[] | undefined;
}

export interface SetupRowLayout<Value> {
  readonly spec: SetupRowSpec<Value>;
  readonly title: StaticTextFrame | undefined;
  readonly info: StaticTextFrame | undefined;
  readonly buttons: readonly SetupButtonLayout<Value>[];
}

export interface SetupWindowLayout {
  readonly window: DisplayItem | undefined;
  readonly title: StaticTextFrame | undefined;
  readonly graphics: SetupRowLayout<GraphicsQuality>;
  readonly volume: SetupRowLayout<number>;
  readonly shake: SetupRowLayout<boolean>;
  readonly blood: SetupRowLayout<boolean>;
  readonly frameRate: SetupRowLayout<FrameRate>;
  readonly ping: SetupRowLayout<boolean>;
  readonly hidden: readonly string[];
}

const WINDOW = [MainMenuChild.OptionsWindow] as const;

export const SETUP_EXPANDED: ReadonlySet<string> = new Set([MainMenuChild.OptionsWindow]);

export const SetupOutcome = {
  Open: 'open',
  Closed: 'closed',
} as const;

export type SetupOutcome = (typeof SetupOutcome)[keyof typeof SetupOutcome];

export function applySetupAction(settings: SettingsService, action: SetupAction): SetupOutcome {
  switch (action.kind) {
    case SetupAction.Close:
      return SetupOutcome.Closed;
    case SetupAction.Reset:
      settings.update(resetSetup);
      return SetupOutcome.Open;
    case SetupAction.Graphics:
      settings.update((current) => withGraphics(current, action.value));
      return SetupOutcome.Open;
    case SetupAction.Volume:
      settings.update((current) => withSoundVolume(current, action.value));
      return SetupOutcome.Open;
    case SetupAction.ScreenShake:
      settings.update((current) => withScreenShake(current, action.value));
      return SetupOutcome.Open;
    case SetupAction.Blood:
      settings.update((current) => withBlood(current, action.value));
      return SetupOutcome.Open;
    case SetupAction.FrameRate:
      settings.update((current) => withFrameRate(current, action.value));
      return SetupOutcome.Open;
    case SetupAction.Ping:
      settings.update((current) => withShowPing(current, action.value));
      return SetupOutcome.Open;
  }
}
const WHITE = 0xffffff;

function childKey(item: DisplayItem): string {
  return item.name ?? depthKey(item.depth);
}

function shifted(frame: StaticTextFrame | undefined, shiftY: number): StaticTextFrame | undefined {
  return frame ? { ...frame, top: frame.top + shiftY } : undefined;
}

function rowLayout<Value>(library: SymbolLibrary, children: readonly DisplayItem[], spec: SetupRowSpec<Value>): SetupRowLayout<Value> {
  const byDepth = (depth: number): DisplayItem | undefined => children.find((item) => item.depth === depth);
  const rowY = children.find((item) => item.name === spec.rowOf)?.matrix[5];
  const buttons = spec.buttons.map((button) => {
    const item = children.find((child) => child.name === button.instance);
    const text = item ? library.frameItems(item.characterId, 0).find((child) => child.depth === SETUP_BUTTON_LABEL_DEPTH) : undefined;
    const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] = item?.matrix ?? [];
    return {
      spec: button,
      matrix: item ? itemMatrix([a, b, c, d, button.x ?? tx, (rowY ?? ty) + spec.shiftY]) : undefined,
      label: staticTextFrame(library, text),
      labelFilters: text?.filters,
    };
  });
  return { spec, title: shifted(staticTextFrame(library, byDepth(spec.titleDepth)), spec.shiftY), info: shifted(staticTextFrame(library, byDepth(spec.infoDepth)), spec.shiftY), buttons };
}

export function setupWindowLayout(library: SymbolLibrary, window: DisplayItem | undefined): SetupWindowLayout {
  const children = window ? library.frameItems(window.characterId, 0) : [];
  const graphics = rowLayout(library, children, GRAPHICS_ROW);
  const volume = rowLayout(library, children, VOLUME_ROW);
  const shake = rowLayout(library, children, SHAKE_ROW);
  const blood = rowLayout(library, children, BLOOD_ROW);
  const frameRate = rowLayout(library, children, FRAME_RATE_ROW);
  const ping = rowLayout(library, children, PING_ROW);
  const kept = new Set<string>([
    Child.Lock,
    Child.Close,
    Child.Reset,
    depthKey(SETUP_WINDOW_BACKGROUND_DEPTH),
    ...[...graphics.buttons, ...volume.buttons, ...shake.buttons, ...blood.buttons, ...frameRate.buttons, ...ping.buttons].map((button) => button.spec.instance),
  ]);
  return {
    window,
    title: staticTextFrame(library, children.find((item) => item.depth === SETUP_TITLE_DEPTH)),
    graphics,
    volume,
    shake,
    blood,
    frameRate,
    ping,
    hidden: children.map(childKey).filter((key) => !kept.has(key)),
  };
}

function buttonPath(...path: string[]): string[] {
  return [...WINDOW, ...path, Child.Button];
}

export type ButtonStateOf = (path: readonly string[]) => ButtonState;

export class SetupWindow {
  constructor(
    private readonly library: SymbolLibrary,
    readonly layout: SetupWindowLayout,
  ) {}

  targets(): MenuTarget<SetupAction>[] {
    const release = (path: readonly string[], action: SetupAction): MenuTarget<SetupAction> => ({ path, trigger: Trigger.Release, action });
    return [
      release(buttonPath(Child.Reset), { kind: SetupAction.Reset }),
      release(buttonPath(Child.Close), { kind: SetupAction.Close }),
      ...this.layout.graphics.buttons.map((button) => release(buttonPath(button.spec.instance), { kind: SetupAction.Graphics, value: button.spec.value })),
      ...this.layout.volume.buttons.map((button) => release(buttonPath(button.spec.instance), { kind: SetupAction.Volume, value: button.spec.value })),
      ...this.layout.shake.buttons.map((button) => release(buttonPath(button.spec.instance), { kind: SetupAction.ScreenShake, value: button.spec.value })),
      ...this.layout.blood.buttons.map((button) => release(buttonPath(button.spec.instance), { kind: SetupAction.Blood, value: button.spec.value })),
      ...this.layout.frameRate.buttons.map((button) => release(buttonPath(button.spec.instance), { kind: SetupAction.FrameRate, value: button.spec.value })),
      ...this.layout.ping.buttons.map((button) => release(buttonPath(button.spec.instance), { kind: SetupAction.Ping, value: button.spec.value })),
      { path: [...WINDOW, Child.Lock], trigger: Trigger.Block },
    ];
  }

  scene(tree: OverrideTree, open: boolean, settings: UserSettings, buttonState: ButtonStateOf): void {
    tree.set(WINDOW, { visible: open });
    if (!open) return;
    for (const key of this.layout.hidden) tree.set([...WINDOW, key], { visible: false });
    const { graphics, volume, shake, blood, frameRate, ping } = this.layout;
    const { title } = this.layout;
    const texts = [
      title && this.text(tree, { name: Child.Title, depth: SETUP_ATTACHED_DEPTH, style: TextStyles.WindowTitle, anchorX: SETUP_TITLE_CENTER_X, top: title.top }, t('setup.title'), WINDOW_TEXT_COLOR),
      ...[graphics, volume, shake, blood, frameRate, ping].flatMap((row, index) => {
        const depth = SETUP_ATTACHED_DEPTH + (index + 1) * 2;
        const rowTitle = row.title;
        const info = row.info;
        return [
          rowTitle && this.text(tree, { name: `${Child.RowTitle}${index}`, depth, style: TextStyles.OptionTitle, anchorX: rowTitle.left, top: rowTitle.top }, t(row.spec.title), WINDOW_TEXT_COLOR),
          info && this.text(tree, { name: `${Child.RowInfo}${index}`, depth: depth + 1, style: TextStyles.OptionInfo, anchorX: info.left, top: info.top }, t(row.spec.info), MENU_TEXT_COLOR),
        ];
      }),
    ].filter((item): item is DisplayItem => item !== undefined);
    tree.set(WINDOW, { attach: texts });
    this.buttons(tree, graphics, settings.graphics, buttonState);
    this.buttons(tree, volume, settings.soundVolume, buttonState);
    this.buttons(tree, shake, settings.screenShake, buttonState);
    this.buttons(tree, blood, settings.blood, buttonState);
    this.buttons(tree, frameRate, settings.frameRate, buttonState);
    this.buttons(tree, ping, settings.showPing, buttonState);
    for (const name of [Child.Close, Child.Reset]) {
      tree.set([...WINDOW, name, Child.Selected], { visible: false });
      tree.set(buttonPath(name), { buttonState: buttonState(buttonPath(name)) });
    }
  }

  private buttons<Value>(tree: OverrideTree, row: SetupRowLayout<Value>, current: Value, buttonState: ButtonStateOf): void {
    for (const button of row.buttons) {
      const path = [...WINDOW, button.spec.instance];
      const frame = button.label;
      const label = frame
        ? placedText(this.library, { name: Child.ButtonLabel, depth: SETUP_ATTACHED_LABEL_DEPTH, style: TextStyles.OptionButton, anchorX: frame.centerX, top: frame.top })
        : undefined;
      tree.set(path, { ...(button.matrix ? { matrix: button.matrix } : {}), ...(label ? { attach: [label.item] } : {}) });
      tree.set([...path, Child.Selected], { visible: current === button.spec.value });
      tree.set(buttonPath(button.spec.instance), { buttonState: buttonState(buttonPath(button.spec.instance)) });
      if (!label) continue;
      tree.set([...path, depthKey(SETUP_BUTTON_LABEL_DEPTH)], { visible: false });
      tree.set([...path, Child.ButtonLabel], { ...textOverride(label, t(button.spec.label), WHITE), ...(button.labelFilters ? { filters: button.labelFilters } : {}) });
    }
  }

  private text(tree: OverrideTree, placement: Omit<TextPlacement, 'width'>, text: string, color: number): DisplayItem | undefined {
    const placed = placedText(this.library, { ...placement, width: SETUP_INFO_WIDTH_PX });
    if (placed) tree.set([...WINDOW, placement.name], textOverride(placed, text, color));
    return placed?.item;
  }
}
