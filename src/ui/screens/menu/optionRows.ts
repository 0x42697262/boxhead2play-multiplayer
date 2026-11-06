import type { DisplayItem } from '../../../adapters/assets/schemas.ts';
import { depthKey, type SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import { OptionField } from '../../../services/menuSettings.ts';
import type { TextKey } from '../../../text/i18n.ts';
import { staticTextFrame, type StaticTextFrame } from '../online/stageText.ts';
import { itemMatrix } from './MainMenuScreen.ts';
import { setupRowLayout, type SetupRowLayout } from './SetupWindow.ts';
import { ADDED_OPTION_ROWS, OPTION_GROUPS, TEAM_ENEMY_GROUPS, OPTION_ROW_SPACING_PX, TEAM_OPTION_LABEL_DEPTH, TEAM_OPTION_LABEL_PREFIX, type AddedOptionRowSpec, type OptionGroupSpec } from './tuning.ts';

export interface OptionRowMove {
  readonly key: string;
  readonly matrix: DisplayItem['matrix'];
}

export interface AddedOptionRow {
  readonly spec: AddedOptionRowSpec;
  readonly layout: SetupRowLayout<number>;
}

export interface OptionRowsLayout {
  readonly groups: readonly OptionGroupSpec[];
  readonly labels: readonly { readonly name: string; readonly depth: number; readonly original: string; readonly frame: StaticTextFrame; readonly text: TextKey; readonly title: boolean }[];
  readonly added: readonly AddedOptionRow[];
  readonly moves: readonly OptionRowMove[];
  readonly hidden: readonly string[];
}

interface PlacedRow {
  readonly group: OptionGroupSpec;
  readonly y: number;
}

function rowKeys(group: OptionGroupSpec): string[] {
  return [...group.buttons.map((button) => button.instance), depthKey(group.titleDepth), depthKey(group.infoDepth)];
}

function childKey(item: DisplayItem): string {
  return item.name ?? depthKey(item.depth);
}

function placedRows(children: readonly DisplayItem[], mode: GameMode): PlacedRow[] {
  const groups = mode === GameMode.TeamBattle ? [...OPTION_GROUPS.filter((group) => !TEAM_ENEMY_GROUPS.some((team) => team.titleDepth === group.titleDepth)), ...TEAM_ENEMY_GROUPS].map((group) => group.field === OptionField.Difficulty ? { ...group, info: 'team.difficulty.info' as const } : group) : OPTION_GROUPS;
  return groups.flatMap((group) => {
    const y = children.find((item) => item.name === group.buttons[0]?.instance)?.matrix[5];
    return y === undefined ? [] : [{ group, y }];
  }).sort((first, second) => first.y - second.y);
}

function movedRow(children: readonly DisplayItem[], row: PlacedRow, slotY: number): OptionRowMove[] {
  const shiftY = slotY - row.y;
  if (shiftY === 0) return [];
  return rowKeys(row.group).flatMap((key) => {
    const item = children.find((child) => childKey(child) === key);
    if (!item) return [];
    const [a, b, c, d, tx, ty] = item.matrix;
    return [{ key, matrix: itemMatrix([a, b, c, d, tx, ty + shiftY]) }];
  });
}

function slotY(slots: readonly number[], index: number): number {
  const last = slots.length - 1;
  return slots[index] ?? (slots[last] ?? 0) + (index - last) * OPTION_ROW_SPACING_PX;
}

export function optionRowsLayout(library: SymbolLibrary, children: readonly DisplayItem[], mode: GameMode): OptionRowsLayout {
  const rows = placedRows(children, mode);
  const slots = rows.map((row) => row.y);
  const shown = rows.filter((row) => row.group.modes.includes(mode));
  const added = ADDED_OPTION_ROWS.filter((spec) => spec.modes.includes(mode)).map((spec, index) => ({
    spec,
    layout: setupRowLayout(library, children, spec.row, slotY(slots, shown.length + index)),
  }));
  return {
    labels: shown.flatMap((row, index) => [
      { depth: row.group.titleDepth, text: row.group.title, title: true },
      { depth: row.group.infoDepth, text: row.group.info, title: false },
    ].flatMap((label, part) => {
      const item = children.find((child) => child.depth === label.depth);
      const frame = staticTextFrame(library, item);
      return frame && label.text ? [{ name: `${TEAM_OPTION_LABEL_PREFIX}${label.depth}`, depth: TEAM_OPTION_LABEL_DEPTH + index * 2 + part, original: depthKey(label.depth), frame: { ...frame, top: frame.top + slotY(slots, index) - row.y }, text: label.text, title: label.title }] : [];
    })),
    groups: shown.map((row) => row.group),
    added,
    moves: shown.flatMap((row, index) => movedRow(children, row, slotY(slots, index))),
    hidden: rows.filter((row) => !shown.includes(row)).flatMap((row) => rowKeys(row.group)),
  };
}
