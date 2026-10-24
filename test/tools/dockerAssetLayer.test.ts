import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SWF_PATH } from '../../tools/extract/tuning.ts';
import { EXTRACTOR_ENTRY } from '../../tools/setup/tuning.ts';

const DOCKERFILE = 'Dockerfile';
const SETUP_ENTRY = 'tools/setup/ensureAssets.ts';
const ASSET_SETUP_RUN = 'RUN npm run setup:assets';
const COPY_INSTRUCTION = 'COPY';
const FLAG_PREFIX = '--';
const RELATIVE_PREFIX = '.';
const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function relativeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(IMPORT_PATTERN)]
    .map((match) => match[1] ?? '')
    .filter((specifier) => specifier.startsWith(RELATIVE_PREFIX))
    .map((specifier) => path.posix.join(path.posix.dirname(file), specifier));
}

function importGraph(entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const pending = [...entries];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    pending.push(...relativeImports(file));
  }
  return seen;
}

function sourcesCopiedBeforeAssetSetup(dockerfile: string): string[] {
  const lines = dockerfile.split('\n').map((line) => line.trim());
  const setupLine = lines.indexOf(ASSET_SETUP_RUN);
  expect(setupLine).toBeGreaterThan(0);
  return lines
    .slice(0, setupLine)
    .map((line) => line.split(/\s+/))
    .filter(([instruction]) => instruction === COPY_INSTRUCTION)
    .flatMap((words) => words.slice(1, -1).filter((word) => !word.startsWith(FLAG_PREFIX)))
    .map((source) => path.posix.normalize(source).replace(/\/$/, ''));
}

describe('Dockerfile asset layer', () => {
  it('copies every file the asset setup and the extractor import before it runs the setup', () => {
    const copied = sourcesCopiedBeforeAssetSetup(readFileSync(DOCKERFILE, 'utf8'));
    const covered = (file: string): boolean => copied.some((source) => file === source || file.startsWith(`${source}/`));
    const needed = [DEFAULT_SWF_PATH, ...importGraph([SETUP_ENTRY, EXTRACTOR_ENTRY])];
    expect(needed.filter((file) => !covered(file))).toEqual([]);
  });

  it('does not copy the whole build context before the asset setup', () => {
    expect(sourcesCopiedBeforeAssetSetup(readFileSync(DOCKERFILE, 'utf8'))).not.toContain(RELATIVE_PREFIX);
  });
});
