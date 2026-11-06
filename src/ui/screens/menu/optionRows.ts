import type { DisplayItem } from '../../../adapters/assets/schemas.ts';
import { depthKey } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import type { GameMode } from '../../../domain/world/GameMode.ts';
import { itemMatrix } from './MainMenuScreen.ts';
import { OPTION_GROUPS, type OptionGroupSpec } from './tuning.ts';

export interface OptionRowMove {
  readonly key: string;
  readonly matrix: DisplayItem['matrix'];
}

export interface OptionRowsLayout {
  readonly groups: readonly OptionGroupSpec[];
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

function placedRows(children: readonly DisplayItem[]): PlacedRow[] {
  return OPTION_GROUPS.flatMap((group) => {
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

export function optionRowsLayout(children: readonly DisplayItem[], mode: GameMode): OptionRowsLayout {
  const rows = placedRows(children);
  const shown = rows.filter((row) => row.group.modes.includes(mode));
  return {
    groups: shown.map((row) => row.group),
    moves: shown.flatMap((row, index) => movedRow(children, row, rows[index]?.y ?? row.y)),
    hidden: rows.filter((row) => !shown.includes(row)).flatMap((row) => rowKeys(row.group)),
  };
}
