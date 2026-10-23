import type { EditText } from '../../assets/schemas.ts';
import type { Matrix } from '../geometry/Matrix.ts';
import { cssColor, type Context2D } from '../surface.ts';
import { RED_SHIFT, GREEN_SHIFT } from '../tuning.ts';

export const TEXT_GUTTER_PX = 2;
const DEFAULT_FONT_SIZE_PX = 12;
const DEFAULT_TEXT_COLOR = 0x000000;
const HTML_TAG = /<[^>]*>/g;
const HTML_ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
const HTML_ENTITY = /&(amp|lt|gt|quot|apos|nbsp);/g;
const LINE_BREAK = /\r\n|\r|\n/;

export interface TextStyle {
  fontFamily(fontId: number): string;
}

export interface TextRun {
  readonly text: string;
  readonly color?: number;
  readonly letterSpacing?: number;
}

export function plainText(editText: EditText): string {
  const raw = editText.initialText ?? '';
  if (!editText.html) return raw;
  return raw.replace(HTML_TAG, '').replace(HTML_ENTITY, (entity) => HTML_ENTITIES[entity] ?? entity);
}

export function editTextColor(editText: EditText): number {
  const color = editText.color;
  return color ? (color.r << RED_SHIFT) | (color.g << GREEN_SHIFT) | color.b : DEFAULT_TEXT_COLOR;
}

export function textAnchorX(editText: EditText): number {
  const { xMin, xMax } = editText.bounds;
  switch (editText.align) {
    case 'center':
      return (xMin + xMax) / 2;
    case 'right':
      return xMax - TEXT_GUTTER_PX - (editText.rightMargin ?? 0);
    default:
      return xMin + TEXT_GUTTER_PX + (editText.leftMargin ?? 0) + (editText.indent ?? 0);
  }
}

function canvasAlign(editText: EditText): CanvasTextAlign {
  if (editText.align === 'center') return 'center';
  if (editText.align === 'right') return 'right';
  return 'left';
}

export function drawEditText(ctx: Context2D, editText: EditText, matrix: Matrix, run: TextRun, alpha: number, style: TextStyle): void {
  const size = editText.fontSize ?? DEFAULT_FONT_SIZE_PX;
  ctx.setTransform(...matrix);
  ctx.globalAlpha = alpha;
  ctx.font = editText.fontId === undefined ? `${size}px sans-serif` : `${size}px "${style.fontFamily(editText.fontId)}"`;
  ctx.letterSpacing = `${run.letterSpacing ?? 0}px`;
  ctx.textAlign = canvasAlign(editText);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cssColor(run.color ?? editTextColor(editText));
  const lines = editText.multiline ? run.text.split(LINE_BREAK) : [run.text.replace(LINE_BREAK, ' ')];
  const ascent = ctx.measureText(run.text).fontBoundingBoxAscent;
  const lineHeight = size + (editText.leading ?? 0);
  const x = textAnchorX(editText);
  lines.forEach((line, index) => ctx.fillText(line, x, editText.bounds.yMin + TEXT_GUTTER_PX + ascent + index * lineHeight));
  ctx.letterSpacing = '0px';
}
