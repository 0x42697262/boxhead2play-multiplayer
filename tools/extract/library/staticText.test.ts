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
          { fontId: 25, yOffset: 100, glyphIndices: [0, 1] },
          { glyphIndices: [2] },
          { yOffset: 300, glyphIndices: [3] },
        ],
      },
      (id) => (id === FONT.id ? FONT : undefined),
    );
    expect(decoded).toEqual({ text: 'BOX\nY', fontIds: [25] });
  });
});
