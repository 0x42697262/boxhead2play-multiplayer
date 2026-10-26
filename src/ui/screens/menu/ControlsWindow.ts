import type { DisplayItem } from '../../../adapters/assets/schemas.ts';
import { keyCodeForCode, validKey } from '../../../adapters/input/validKeys.ts';
import { depthKey, type ButtonState, type SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import type { Logger } from '../../../observability/logger.ts';
import { resetKeys, withKey } from '../../../services/menuSettings.ts';
import type { SettingsService } from '../../../services/SettingsService.ts';
import { t } from '../../../text/i18n.ts';
import { LogEvent } from '../../../text/logEvents.ts';
import { placedText, staticTextFrame, textOverride, type StaticTextFrame } from '../online/stageText.ts';
import { TextStyles, WINDOW_TEXT_COLOR } from '../online/tuning.ts';
import { KeyCapture, KeyPressOutcome, type KeyTarget } from './KeyCapture.ts';
import { Trigger, type MenuTarget } from './MenuPointer.ts';
import type { OverrideTree } from './overrideTree.ts';
import {
  CHANGE_KEY_PREFIX,
  CONTROL_PANEL,
  CONTROLS_ATTACHED_DEPTH,
  CONTROLS_INFO_DEPTH,
  CONTROLS_PANEL_X,
  CONTROLS_TEXT_CENTER_X,
  CONTROLS_TEXT_WIDTH_PX,
  CONTROLS_TITLE_DEPTH,
  ControlsWindowText,
  KEY_ROWS,
  KEY_TEXT_PREFIX,
  MS_PER_SECOND,
  SECOND_CONTROL_PANEL,
  SECOND_CONTROLS_TITLE_DEPTH,
  SelectWorldChild as Child,
} from './tuning.ts';

export const ControlsAction = {
  Close: 'close',
  Reset: 'reset',
  ChangeKey: 'changeKey',
} as const;

export type ControlsAction =
  | { readonly kind: typeof ControlsAction.Close }
  | { readonly kind: typeof ControlsAction.Reset }
  | { readonly kind: typeof ControlsAction.ChangeKey; readonly target: KeyTarget };

export const ControlsOutcome = {
  Open: 'open',
  Closed: 'closed',
} as const;

export type ControlsOutcome = (typeof ControlsOutcome)[keyof typeof ControlsOutcome];

export interface ControlsWindowLayout {
  readonly title: StaticTextFrame | undefined;
  readonly info: StaticTextFrame | undefined;
  readonly pressAKeyFrames: number;
  readonly ownKeysY: number;
}

export interface ControlsWindowDependencies {
  readonly library: SymbolLibrary;
  readonly layout: ControlsWindowLayout;
  readonly settings: SettingsService;
  readonly logger: Logger;
  readonly ticksPerSecond: () => number;
}

export const CONTROLS_WINDOW = [Child.WindowControls] as const;
const PRESS_KEY = [...CONTROLS_WINDOW, Child.PressKey] as const;
const OWN_KEYS = [...CONTROLS_WINDOW, CONTROL_PANEL] as const;
const SINGLE_FRAME = 1;
const HIDDEN_PARTS = [Child.TwoPlayerCover, SECOND_CONTROL_PANEL, ...[CONTROLS_TITLE_DEPTH, SECOND_CONTROLS_TITLE_DEPTH, CONTROLS_INFO_DEPTH].map(depthKey)];

function buttonPath(...path: string[]): string[] {
  return [...path, Child.Button];
}

function keyButtonPath(variable: string): string[] {
  return [...OWN_KEYS, `${CHANGE_KEY_PREFIX}${variable}`];
}

export function controlsWindowLayout(library: SymbolLibrary, items: readonly DisplayItem[]): ControlsWindowLayout {
  const pressKey = library.resolve(items, PRESS_KEY, undefined);
  const pressAKey = pressKey ? library.findChild(pressKey.item.characterId, Child.PressAKey) : undefined;
  const window = items.find((item) => item.name === Child.WindowControls);
  const children = window ? library.frameItems(window.characterId, 0) : [];
  const text = (depth: number): StaticTextFrame | undefined => staticTextFrame(library, children.find((item) => item.depth === depth));
  return {
    title: text(CONTROLS_TITLE_DEPTH),
    info: text(CONTROLS_INFO_DEPTH),
    pressAKeyFrames: (pressAKey ? library.sprite(pressAKey.characterId)?.frameCount : undefined) ?? SINGLE_FRAME,
    ownKeysY: library.resolve(items, OWN_KEYS, undefined)?.item.matrix[5] ?? 0,
  };
}

export class ControlsWindow {
  private readonly capture = new KeyCapture();
  private ticks = 0;
  private captureTick = 0;

  constructor(private readonly deps: ControlsWindowDependencies) {}

  get capturing(): boolean {
    return this.capture.active;
  }

  tick(): void {
    this.ticks++;
  }

  targets(): MenuTarget<ControlsAction>[] {
    if (this.capture.active) return [{ path: [...PRESS_KEY, Child.Lock], trigger: Trigger.Block }];
    const keys = KEY_ROWS.map((row) => ({
      path: keyButtonPath(row.variable),
      trigger: Trigger.Release,
      action: { kind: ControlsAction.ChangeKey, target: { field: row.field } } as const,
    }));
    return [
      { path: buttonPath(...CONTROLS_WINDOW, Child.Reset), trigger: Trigger.Release, action: { kind: ControlsAction.Reset } },
      { path: buttonPath(...CONTROLS_WINDOW, Child.Close), trigger: Trigger.Release, action: { kind: ControlsAction.Close } },
      ...keys,
      { path: [...CONTROLS_WINDOW, Child.Lock], trigger: Trigger.Block },
    ];
  }

  perform(action: ControlsAction): ControlsOutcome {
    switch (action.kind) {
      case ControlsAction.Close:
        return ControlsOutcome.Closed;
      case ControlsAction.Reset:
        this.deps.settings.update(resetKeys);
        return ControlsOutcome.Open;
      case ControlsAction.ChangeKey:
        this.capture.begin(action.target);
        this.captureTick = this.ticks;
        return ControlsOutcome.Open;
    }
  }

  key(code: string): boolean {
    if (!this.capture.active) return false;
    const result = this.capture.press(keyCodeForCode(code), this.nowMs());
    if (result.outcome === KeyPressOutcome.Assigned) {
      const { field } = result.target;
      this.deps.settings.update((settings) => withKey(settings, field, result.keyCode));
      this.deps.logger.info(LogEvent.KeyRebound, { field, keyCode: result.keyCode });
    }
    return true;
  }

  scene(tree: OverrideTree, open: boolean, buttonState: (path: readonly string[]) => ButtonState): void {
    tree.set(CONTROLS_WINDOW, { visible: open });
    if (!open) return;
    const button = (path: readonly string[]): void => tree.set(path, { buttonState: buttonState(path) });
    for (const key of HIDDEN_PARTS) tree.set([...CONTROLS_WINDOW, key], { visible: false });
    tree.set(OWN_KEYS, { matrix: [1, 0, 0, 1, CONTROLS_PANEL_X, this.deps.layout.ownKeysY] });
    this.texts(tree);
    const keys = this.deps.settings.settings.keys;
    for (const row of KEY_ROWS) {
      const key = validKey(keys[row.field]);
      tree.set([...OWN_KEYS, `${KEY_TEXT_PREFIX}${row.variable}`], { text: key ? t(key.name) : '' });
      button(keyButtonPath(row.variable));
    }
    for (const name of [Child.Close, Child.Reset]) {
      tree.set([...CONTROLS_WINDOW, name, Child.Selected], { visible: false });
      button(buttonPath(...CONTROLS_WINDOW, name));
    }
    tree.set(PRESS_KEY, { visible: this.capture.active });
    if (!this.capture.active) return;
    const display = this.capture.display(this.nowMs());
    const blink = (this.ticks - this.captureTick) % this.deps.layout.pressAKeyFrames;
    tree.set([...PRESS_KEY, Child.PressAKey], { frame: blink, alpha: display.pressAKeyAlpha });
    tree.set([...PRESS_KEY, Child.InvalidKey], { visible: display.invalidVisible, alpha: display.invalidAlpha });
  }

  private texts(tree: OverrideTree): void {
    const { library, layout } = this.deps;
    const texts = [
      { frame: layout.title, name: ControlsWindowText.Title, style: TextStyles.Heading, text: t('controls.title') },
      { frame: layout.info, name: ControlsWindowText.Info, style: TextStyles.Small, text: t('controls.info', { upgradeKey: t('controls.upgradeListKey'), playerKey: t('controls.playerListKey') }) },
    ];
    const attached = texts.flatMap(({ frame, name, style, text }, index) => {
      if (!frame) return [];
      const placed = placedText(library, { name, depth: CONTROLS_ATTACHED_DEPTH + index, style, anchorX: CONTROLS_TEXT_CENTER_X, top: frame.top, width: CONTROLS_TEXT_WIDTH_PX });
      if (!placed) return [];
      tree.set([...CONTROLS_WINDOW, name], textOverride(placed, text, WINDOW_TEXT_COLOR));
      return [placed.item];
    });
    tree.set(CONTROLS_WINDOW, { attach: attached });
  }

  private nowMs(): number {
    return (this.ticks * MS_PER_SECOND) / this.deps.ticksPerSecond();
  }
}
