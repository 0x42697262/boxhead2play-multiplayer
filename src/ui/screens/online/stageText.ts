import type { DisplayItem, EditText, StaticText, TextAlign } from '../../../adapters/assets/schemas.ts';
import type { Rect } from '../../../adapters/render/geometry/Rect.ts';
import { TEXT_GUTTER_PX, textAnchorX } from '../../../adapters/render/symbols/editText.ts';
import type { ChildOverride, SymbolLibrary } from '../../../adapters/render/symbols/SymbolLibrary.ts';
import { itemMatrix } from '../menu/MainMenuScreen.ts';

export interface TextStyle {
  readonly characterId: number;
  readonly scale: number;
}

export interface TextPlacement {
  readonly name: string;
  readonly depth: number;
  readonly style: TextStyle;
  readonly anchorX: number;
  readonly top: number;
  readonly width?: number;
  readonly align?: TextAlign;
}

export interface PlacedText {
  readonly item: DisplayItem;
  readonly bounds: Rect;
  readonly align?: TextAlign;
}

const ATTACHED_INSTANCE = 0;

function widened(editText: EditText, localWidth: number | undefined): Rect {
  const { bounds } = editText;
  if (localWidth === undefined) return bounds;
  switch (editText.align) {
    case 'center': {
      const center = (bounds.xMin + bounds.xMax) / 2;
      return { ...bounds, xMin: center - localWidth / 2, xMax: center + localWidth / 2 };
    }
    case 'right':
      return { ...bounds, xMin: bounds.xMax - localWidth };
    default:
      return { ...bounds, xMax: bounds.xMin + localWidth };
  }
}

export function placedText(library: SymbolLibrary, placement: TextPlacement): PlacedText | undefined {
  const { style } = placement;
  const character = library.character(style.characterId);
  if (character?.kind !== 'editText') return undefined;
  const aligned = placement.align === undefined ? character.editText : { ...character.editText, align: placement.align };
  const bounds = widened(aligned, placement.width === undefined ? undefined : placement.width / style.scale);
  const editText = { ...aligned, bounds };
  const x = placement.anchorX - textAnchorX(editText) * style.scale;
  const y = placement.top - (bounds.yMin + TEXT_GUTTER_PX) * style.scale;
  const item = { depth: placement.depth, characterId: style.characterId, instance: ATTACHED_INSTANCE, matrix: itemMatrix([style.scale, 0, 0, style.scale, x, y]), name: placement.name };
  return placement.align === undefined ? { item, bounds } : { item, bounds, align: placement.align };
}

export interface StaticTextFrame {
  readonly left: number;
  readonly centerX: number;
  readonly top: number;
}

export function staticTextFrame(library: SymbolLibrary, item: DisplayItem | undefined): StaticTextFrame | undefined {
  if (!item) return undefined;
  const character = library.character(item.characterId);
  if (character?.kind !== 'graphic') return undefined;
  const bounds: Rect = character.graphic.bounds;
  const [scaleX, , , scaleY, tx, ty] = item.matrix;
  return { left: tx + bounds.xMin * scaleX, centerX: tx + ((bounds.xMin + bounds.xMax) / 2) * scaleX, top: ty + bounds.yMin * scaleY };
}

export function clipBefore(text: StaticText, cut: string, marginPx: number): Rect | undefined {
  const glyph = text.glyphs?.[text.text.indexOf(cut)];
  if (!text.text.includes(cut) || !glyph) return undefined;
  const { bounds } = text;
  return { xMin: bounds.xMin - marginPx, yMin: bounds.yMin - marginPx, xMax: glyph.x, yMax: bounds.yMax + marginPx };
}

export function clippedAt(placed: PlacedText, right: number): Rect {
  const [scale = 1, , , , tx = 0] = placed.item.matrix;
  return { ...placed.bounds, xMax: Math.min(placed.bounds.xMax, (right - tx) / scale) };
}

export function textOverride(placed: PlacedText, text: string, textColor: number): ChildOverride {
  return placed.align === undefined ? { text, textColor, textBounds: placed.bounds } : { text, textColor, textBounds: placed.bounds, textAlign: placed.align };
}
