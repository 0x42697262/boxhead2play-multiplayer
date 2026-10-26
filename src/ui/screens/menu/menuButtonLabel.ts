import type { DisplayItem, Filter } from '../../../adapters/assets/schemas.ts';
import { depthKey, type SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import { placedText, staticTextFrame, textOverride, type StaticTextFrame } from '../online/stageText.ts';
import { ATTACHED_LABEL_DEPTH, MENU_LABEL_DEPTH, MENU_LABEL_TOP_OFFSET_PX, MENU_TEXT_COLOR, TextStyles } from '../online/tuning.ts';
import type { OverrideTree } from './overrideTree.ts';
import { MainMenuChild, ROLL_OUT_ALPHA, ROLL_OVER_ALPHA } from './tuning.ts';

export const MENU_BUTTON_LABEL = 'menuLabel';

const LEFT = 'left';

const NO_FILTERS: readonly Filter[] = [];

export interface MenuButtonLook {
  readonly name: string;
  readonly frame: StaticTextFrame | undefined;
  readonly text: string;
  readonly highlighted: boolean;
  readonly filters: readonly Filter[] | undefined;
  readonly leftAligned?: { readonly width: number };
  readonly labelWidth?: number;
}

export function menuButtonLabelFrame(library: SymbolLibrary, items: readonly DisplayItem[], name: string): StaticTextFrame | undefined {
  const button = items.find((item) => item.name === name);
  const contents = button ? library.findChild(button.characterId, MainMenuChild.Contents) : undefined;
  const label = contents ? library.frameItems(contents.characterId, 0).find((item) => item.depth === MENU_LABEL_DEPTH) : undefined;
  return staticTextFrame(library, label);
}

export function sceneMenuButton(tree: OverrideTree, library: SymbolLibrary, look: MenuButtonLook): void {
  const { name, frame } = look;
  const label = frame
    ? placedText(library, {
        name: MENU_BUTTON_LABEL,
        depth: ATTACHED_LABEL_DEPTH,
        style: TextStyles.MenuLabel,
        anchorX: look.leftAligned ? frame.left : frame.centerX,
        top: frame.top + MENU_LABEL_TOP_OFFSET_PX,
        ...(look.leftAligned ? { align: LEFT, width: look.leftAligned.width } : look.labelWidth === undefined ? {} : { width: look.labelWidth }),
      })
    : undefined;
  const contents = [name, MainMenuChild.Contents];
  tree.set(contents, {
    alpha: look.highlighted ? ROLL_OVER_ALPHA : ROLL_OUT_ALPHA,
    filters: look.filters ?? NO_FILTERS,
    ...(label ? { attach: [label.item] } : {}),
  });
  if (!label) return;
  tree.set([...contents, depthKey(MENU_LABEL_DEPTH)], { visible: false });
  tree.set([...contents, MENU_BUTTON_LABEL], textOverride(label, look.text, MENU_TEXT_COLOR));
}
