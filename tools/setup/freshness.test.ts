import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractorFingerprint, extractorSourcePaths, ffdecJarFingerprint, fingerprintSources, SetupError, sha256 } from './environment.ts';
import { isExtractorSource, judgeFreshness, parseJavaMajor, StaleReason, type ExtractStamp } from './freshness.ts';
import { EXTRACTOR_SHARED_SOURCES } from './tuning.ts';

const expected: ExtractStamp = {
  formatVersion: 2,
  swfSha256: 'swf',
  extractorSha256: 'tools',
  assetFormatVersion: 1,
  ffdecVersion: '26.4.0',
  ffdecJarSha256: null,
};

function withRepo(files: Readonly<Record<string, string>>, run: (root: string) => void): void {
  const root = mkdtempSync(path.join(tmpdir(), 'extract-stamp-'));
  try {
    for (const [relative, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      writeFileSync(path.join(root, relative), content);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('judgeFreshness', () => {
  it('accepts assets whose stamp matches the SWF, extractor and FFDec version', () => {
    expect(judgeFreshness({ manifestExists: true, stamp: { ...expected } }, expected)).toEqual({ fresh: true });
  });

  it('names the reason assets must be regenerated', () => {
    const stale = (manifestExists: boolean, stamp: unknown) => judgeFreshness({ manifestExists, stamp }, expected);
    expect(stale(false, expected)).toEqual({ fresh: false, reason: StaleReason.NoAssets });
    expect(stale(true, undefined)).toEqual({ fresh: false, reason: StaleReason.NoStamp });
    expect(stale(true, { ...expected, formatVersion: 0 })).toEqual({ fresh: false, reason: StaleReason.NoStamp });
    expect(stale(true, { ...expected, swfSha256: 'other' })).toEqual({ fresh: false, reason: StaleReason.SwfChanged });
    expect(stale(true, { ...expected, extractorSha256: 'other' })).toEqual({ fresh: false, reason: StaleReason.ExtractorChanged });
    expect(stale(true, { ...expected, ffdecVersion: '25.0.0' })).toEqual({ fresh: false, reason: StaleReason.FfdecChanged });
    expect(stale(true, { ...expected, assetFormatVersion: 0 })).toEqual({ fresh: false, reason: StaleReason.AssetFormatChanged });
    expect(stale(true, { ...expected, ffdecJarSha256: 'user-jar' })).toEqual({ fresh: false, reason: StaleReason.FfdecChanged });
    expect(stale(true, { formatVersion: 1, swfSha256: 'swf', extractorSha256: 'tools', ffdecVersion: '26.4.0' })).toEqual({
      fresh: false,
      reason: StaleReason.NoStamp,
    });
  });
});

describe('extractor fingerprint', () => {
  it('selects pipeline sources and ignores tests, debug and testing helpers', () => {
    const select = (file: string) => isExtractorSource(file, '.ts', ['.test.ts'], ['debug', 'testing']);
    expect(select('pipeline.ts')).toBe(true);
    expect(select('rooms/rooms.ts')).toBe(true);
    expect(select('rooms/rooms.test.ts')).toBe(false);
    expect(select('debug/composeRoomSvg.ts')).toBe(false);
    expect(select('testing/fixtures.ts')).toBe(false);
    expect(select('README.md')).toBe(false);
  });

  it('covers the shared schema module the extractor imports from src/', () => {
    const repo = { 'tools/extract/main.ts': 'main', 'tools/extract/main.test.ts': 'test', 'src/adapters/assets/schemas.ts': 'v1' };
    withRepo(repo, (root) => {
      expect(extractorSourcePaths(root)).toEqual(['tools/extract/main.ts', 'src/adapters/assets/schemas.ts']);
      const before = extractorFingerprint(root);
      writeFileSync(path.join(root, 'src/adapters/assets/schemas.ts'), 'v2');
      expect(extractorFingerprint(root)).not.toBe(before);
    });
  });

  it('lists shared sources that exist in this repository', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..');
    for (const shared of EXTRACTOR_SHARED_SOURCES) expect(existsSync(path.join(repoRoot, shared))).toBe(true);
  });

  it('does not depend on file order but does depend on content', () => {
    const a = { path: 'a.ts', content: 'x' };
    const b = { path: 'b.ts', content: 'y' };
    expect(fingerprintSources([a, b])).toBe(fingerprintSources([b, a]));
    expect(fingerprintSources([a, b])).not.toBe(fingerprintSources([a, { ...b, content: 'z' }]));
  });
});

describe('ffdecJarFingerprint', () => {
  it('is null for the pinned download and the SHA-256 of a user jar', () => {
    expect(ffdecJarFingerprint(undefined)).toBeNull();
    withRepo({ 'ffdec.jar': 'jar bytes' }, (root) => {
      expect(ffdecJarFingerprint(path.join(root, 'ffdec.jar'))).toBe(sha256('jar bytes'));
      expect(() => ffdecJarFingerprint(path.join(root, 'missing.jar'))).toThrow(SetupError);
    });
  });
});

describe('parseJavaMajor', () => {
  it('reads modern and legacy version strings', () => {
    expect(parseJavaMajor('openjdk version "21.0.12" 2026-07-21')).toBe(21);
    expect(parseJavaMajor('java version "1.8.0_402"')).toBe(8);
    expect(parseJavaMajor('openjdk version "17" 2021-09-14')).toBe(17);
    expect(parseJavaMajor('command not found')).toBeUndefined();
  });
});
