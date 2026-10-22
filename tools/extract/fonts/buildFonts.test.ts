import { describe, expect, it } from 'vitest';
import { swfIndex } from '../testing/fixtures.ts';
import { buildFonts, exportedFontFiles, FontBuildError } from './buildFonts.ts';

const index = swfIndex([{ kind: 'font', id: 2, name: 'Trebuchet MS', bold: false, italic: false, codeTable: [32, 65] }]);

describe('buildFonts', () => {
  it('indexes fonts with their code points and WOFF files', () => {
    const output = buildFonts(index, exportedFontFiles(['2_Trebuchet MS.woff', 'notes.txt']));
    expect(output.index.fonts['2']).toEqual({ name: 'Trebuchet MS', bold: false, italic: false, file: '2.woff', codePoints: [32, 65] });
    expect(output.copies).toEqual([{ from: '2_Trebuchet MS.woff', to: '2.woff' }]);
  });

  it('fails when FFDec did not export a font', () => {
    expect(() => buildFonts(index, new Map())).toThrow(FontBuildError);
  });
});
