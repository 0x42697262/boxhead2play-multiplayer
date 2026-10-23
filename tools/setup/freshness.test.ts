import { describe, expect, it } from 'vitest';
import { fingerprintSources } from './environment.ts';
import { isExtractorSource, judgeFreshness, parseJavaMajor, StaleReason, type ExtractStamp } from './freshness.ts';

const expected: ExtractStamp = { formatVersion: 1, swfSha256: 'swf', extractorSha256: 'tools', ffdecVersion: '26.4.0' };

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

  it('does not depend on file order but does depend on content', () => {
    const a = { path: 'a.ts', content: 'x' };
    const b = { path: 'b.ts', content: 'y' };
    expect(fingerprintSources([a, b])).toBe(fingerprintSources([b, a]));
    expect(fingerprintSources([a, b])).not.toBe(fingerprintSources([a, { ...b, content: 'z' }]));
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
