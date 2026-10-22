import { ASSET_FORMAT_VERSION, type FontIndex } from '../../../src/adapters/assets/schemas.ts';
import type { SwfIndex } from '../swf/swfIndex.ts';
import { FONT_FILE_EXTENSION } from '../tuning.ts';

const EXPORTED_FONT = /^(\d+)_.*$/;

export interface FontCopy {
  readonly from: string;
  readonly to: string;
}

export interface FontsOutput {
  readonly index: FontIndex;
  readonly copies: FontCopy[];
}

export class FontBuildError extends Error {}

export function exportedFontFiles(fileNames: readonly string[]): Map<number, string> {
  const files = new Map<number, string>();
  for (const name of fileNames) {
    if (!name.endsWith(FONT_FILE_EXTENSION)) continue;
    const id = EXPORTED_FONT.exec(name)?.[1];
    if (id !== undefined) files.set(Number(id), name);
  }
  return files;
}

export function buildFonts(index: SwfIndex, exportedFiles: ReadonlyMap<number, string>): FontsOutput {
  const fonts: FontIndex['fonts'] = {};
  const copies: FontCopy[] = [];
  const definitions = [...index.document.characters.values()].sort((first, second) => first.id - second.id);
  for (const definition of definitions) {
    if (definition.kind !== 'font') continue;
    const source = exportedFiles.get(definition.id);
    if (source === undefined) throw new FontBuildError(`FFDec exported no font file for font ${definition.id}`);
    const file = `${definition.id}${FONT_FILE_EXTENSION}`;
    fonts[String(definition.id)] = {
      name: definition.name,
      bold: definition.bold,
      italic: definition.italic,
      file,
      codePoints: [...definition.codeTable],
    };
    copies.push({ from: source, to: file });
  }
  return { index: { formatVersion: ASSET_FORMAT_VERSION, fonts }, copies };
}
