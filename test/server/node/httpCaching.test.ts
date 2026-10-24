import { describe, expect, it } from 'vitest';
import { chooseEncoding, etagMatches, isHashedBundle } from '../../../src/server/node/httpCaching.ts';

describe('chooseEncoding', () => {
  it('prefers brotli, then gzip, among the variants that exist', () => {
    expect(chooseEncoding('gzip, deflate, br, zstd', ['br', 'gzip'])).toBe('br');
    expect(chooseEncoding('gzip, deflate', ['br', 'gzip'])).toBe('gzip');
    expect(chooseEncoding('gzip, br', ['gzip'])).toBe('gzip');
  });

  it('honors q=0, wildcards and missing headers', () => {
    expect(chooseEncoding('br;q=0, gzip', ['br', 'gzip'])).toBe('gzip');
    expect(chooseEncoding('*', ['br', 'gzip'])).toBe('br');
    expect(chooseEncoding('*;q=0', ['br', 'gzip'])).toBeUndefined();
    expect(chooseEncoding('identity', ['br', 'gzip'])).toBeUndefined();
    expect(chooseEncoding(undefined, ['br'])).toBeUndefined();
    expect(chooseEncoding('br', [])).toBeUndefined();
  });
});

describe('etagMatches', () => {
  it('compares weakly and accepts lists and the wildcard', () => {
    expect(etagMatches('W/"abc"', 'W/"abc"')).toBe(true);
    expect(etagMatches('"abc"', 'W/"abc"')).toBe(true);
    expect(etagMatches('"x", W/"abc"', 'W/"abc"')).toBe(true);
    expect(etagMatches('*', 'W/"abc"')).toBe(true);
    expect(etagMatches('W/"abd"', 'W/"abc"')).toBe(false);
    expect(etagMatches(undefined, 'W/"abc"')).toBe(false);
  });
});

describe('isHashedBundle', () => {
  it('matches the Vite build output only', () => {
    expect(isHashedBundle('assets/index-BVrz_ycd.js')).toBe(true);
    expect(isHashedBundle('assets/index-D5tRimfE.css')).toBe(true);
    expect(isHashedBundle('assets/index-BVrz_ycd.js.map')).toBe(true);
    expect(isHashedBundle('assets/manifest.json')).toBe(false);
    expect(isHashedBundle('assets/library/symbols.json')).toBe(false);
    expect(isHashedBundle('index.html')).toBe(false);
  });
});
