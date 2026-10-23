import { roundToTwips, twipsToPixels } from '../swf/geometry.ts';
import type { FontDefinition, TextDefinition } from '../swf/types.ts';

export interface DecodedGlyph {
  readonly char: string;
  readonly x: number;
  readonly advance: number;
}

export interface DecodedText {
  readonly text: string;
  readonly fontIds: number[];
  readonly glyphs: DecodedGlyph[];
}

const LINE_BREAK = '\n';
const UNKNOWN_GLYPH = '\uFFFD';

export function decodeStaticText(
  definition: TextDefinition,
  fontById: (id: number) => FontDefinition | undefined,
): DecodedText {
  const fontIds: number[] = [];
  const glyphs: DecodedGlyph[] = [];
  const { a: scaleX, tx } = definition.matrix;
  let fontId: number | undefined;
  let lineY: number | undefined;
  let penX = 0;
  let text = '';
  for (const record of definition.records) {
    if (record.fontId !== undefined) {
      fontId = record.fontId;
      if (!fontIds.includes(fontId)) fontIds.push(fontId);
    }
    if (record.yOffset !== undefined) {
      if (lineY !== undefined && record.yOffset !== lineY) text += LINE_BREAK;
      lineY = record.yOffset;
    }
    if (record.xOffset !== undefined) penX = record.xOffset;
    const codeTable = fontId === undefined ? [] : (fontById(fontId)?.codeTable ?? []);
    record.glyphIndices.forEach((glyph, index) => {
      const code = codeTable[glyph];
      const char = code === undefined ? UNKNOWN_GLYPH : String.fromCodePoint(code);
      const advance = record.glyphAdvances[index] ?? 0;
      text += char;
      glyphs.push({ char, x: twipsToPixels(roundToTwips(scaleX * penX + tx)), advance: twipsToPixels(roundToTwips(scaleX * advance)) });
      penX += advance;
    });
  }
  return { text, fontIds, glyphs };
}
