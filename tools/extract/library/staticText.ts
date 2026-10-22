import type { FontDefinition, TextDefinition } from '../swf/types.ts';

export interface DecodedText {
  readonly text: string;
  readonly fontIds: number[];
}

const LINE_BREAK = '\n';
const UNKNOWN_GLYPH = '\uFFFD';

export function decodeStaticText(
  definition: TextDefinition,
  fontById: (id: number) => FontDefinition | undefined,
): DecodedText {
  const fontIds: number[] = [];
  let fontId: number | undefined;
  let lineY: number | undefined;
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
    const codeTable = fontId === undefined ? [] : (fontById(fontId)?.codeTable ?? []);
    for (const glyph of record.glyphIndices) {
      const code = codeTable[glyph];
      text += code === undefined ? UNKNOWN_GLYPH : String.fromCodePoint(code);
    }
  }
  return { text, fontIds };
}
