import { describe, expect, it } from 'vitest';
import { IDENTITY_MATRIX } from '../swf/geometry.ts';
import type { FontDefinition } from '../swf/types.ts';
import { rect } from '../testing/fixtures.ts';
import { decodeStaticText } from './staticText.ts';

const FONT: FontDefinition = { kind: 'font', id: 25, name: 'Calibri', bold: true, italic: false, codeTable: [66, 79, 88, 89] };

describe('decodeStaticText', () => {
  it('maps glyph indices through the font code table and breaks lines on y offset changes', () => {
    const decoded = decodeStaticText(
      {
        kind: 'text',
        id: 421,
        bounds: rect(0, 0, 10, 10),
        matrix: IDENTITY_MATRIX,
        records: [
          { fontId: 25, yOffset: 100, glyphIndices: [0, 1], glyphAdvances: [100, 120] },
          { glyphIndices: [2], glyphAdvances: [100] },
          { yOffset: 300, glyphIndices: [3], glyphAdvances: [80] },
        ],
      },
      (id) => (id === FONT.id ? FONT : undefined),
    );
    expect(decoded.text).toBe('BOX\nY');
    expect(decoded.fontIds).toEqual([25]);
  });

  it('places each glyph at the pen position through the text matrix, in pixels', () => {
    const decoded = decodeStaticText(
      {
        kind: 'text',
        id: 206,
        bounds: rect(0, 0, 10, 10),
        matrix: { ...IDENTITY_MATRIX, tx: 1532 },
        records: [
          { fontId: 25, xOffset: 140, glyphIndices: [0, 1], glyphAdvances: [144, 74] },
          { glyphIndices: [2], glyphAdvances: [61] },
          { xOffset: 0, glyphIndices: [3], glyphAdvances: [136] },
        ],
      },
      (id) => (id === FONT.id ? FONT : undefined),
    );
    expect(decoded.glyphs).toEqual([
      { char: 'B', x: 83.6, advance: 7.2 },
      { char: 'O', x: 90.8, advance: 3.7 },
      { char: 'X', x: 94.5, advance: 3.05 },
      { char: 'Y', x: 76.6, advance: 6.8 },
    ]);
  });
});
