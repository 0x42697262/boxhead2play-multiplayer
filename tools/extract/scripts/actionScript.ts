import { SCRIPT_NOISE_LINE, SELF_HIDE_STATEMENT } from '../tuning.ts';

export class ScriptParseError extends Error {}

const REGISTER_CLASS = /Object\.registerClass\(\s*"([^"]+)"\s*,\s*(?:eval\(\s*"([^"]+)"\s*\)|([\w.]+))\s*\)/g;
const SPRITE_DIRECTORY = /^DefineSprite_(\d+)(?:_.*)?$/;
const FRAME_DIRECTORY = /^frame_(\d+)$/;
const REGISTER_SOUND =
  /(\w+)\.(\w+)\s*=\s*this\.RegisterSound\(\s*"(\w+)"\s*,\s*"([^"]+)"\s*,\s*([\d.]+)\s*,\s*this\.PlaySound_(\w+)\s*,\s*this\.StopSound_\w+\s*\)/g;
const LINE_SPLIT = /\r?\n/;

export interface ParsedSoundRegistration {
  readonly table: string;
  readonly key: string;
  readonly type: string;
  readonly linkage: string;
  readonly volume: number;
  readonly playback: string;
}

export function parseRegisteredClasses(sources: readonly string[]): Map<string, string> {
  const classes = new Map<string, string>();
  for (const source of sources) {
    for (const match of source.matchAll(REGISTER_CLASS)) {
      const linkage = match[1];
      const className = match[2] ?? match[3];
      if (linkage !== undefined && className !== undefined) classes.set(linkage, className);
    }
  }
  return classes;
}

export function cleanScript(source: string): string {
  return source
    .split(LINE_SPLIT)
    .filter((line) => !SCRIPT_NOISE_LINE.test(line))
    .join('\n')
    .trim();
}

export function isSelfHiding(source: string): boolean {
  return source.split(LINE_SPLIT).some((line) => line === SELF_HIDE_STATEMENT);
}

export function spriteIdFromDirectory(name: string): number | undefined {
  const match = SPRITE_DIRECTORY.exec(name);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

export function frameIndexFromDirectory(name: string): number | undefined {
  const match = FRAME_DIRECTORY.exec(name);
  return match?.[1] === undefined ? undefined : Number(match[1]) - 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseStaticNumberArray(source: string, name: string): number[] {
  const pattern = new RegExp(`static var ${escapeRegExp(name)}\\s*=\\s*\\[([^\\]]*)\\]`);
  const body = pattern.exec(source)?.[1];
  if (body === undefined) throw new ScriptParseError(`Static array ${name} not found`);
  return body.split(',').map((entry) => Number(entry.trim()));
}

export function parseStaticNumber(source: string, name: string): number {
  const pattern = new RegExp(`static var ${escapeRegExp(name)}\\s*=\\s*(-?[\\d.]+)`);
  const value = pattern.exec(source)?.[1];
  if (value === undefined) throw new ScriptParseError(`Static number ${name} not found`);
  return Number(value);
}

export function parseSoundRegistrations(source: string): ParsedSoundRegistration[] {
  return [...source.matchAll(REGISTER_SOUND)].map((match) => ({
    table: match[1] ?? '',
    key: match[2] ?? '',
    type: match[3] ?? '',
    linkage: match[4] ?? '',
    volume: Number(match[5]),
    playback: (match[6] ?? '').toLowerCase(),
  }));
}

const STYLE_SHEET_LINK = /mMaterials\.(\w+)\.mcLinkID\s*=\s*"([^"]+)"/g;
const STYLE_SHEET_FUNCTION = /static function (SS_\w+)\s*\(/g;

export function parseStyleSheetTextureLinks(source: string): Map<string, string[]> {
  const links = new Map<string, string[]>();
  const functions = [...source.matchAll(STYLE_SHEET_FUNCTION)].map((match) => ({
    name: match[1] ?? '',
    start: match.index,
  }));
  for (const match of source.matchAll(STYLE_SHEET_LINK)) {
    const owner = functions.filter((candidate) => candidate.start < match.index).at(-1)?.name ?? '';
    const linkage = match[2] ?? '';
    links.set(linkage, [...(links.get(linkage) ?? []), owner]);
  }
  return links;
}
