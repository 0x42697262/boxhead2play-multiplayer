import { describe, expect, it } from 'vitest';
import { LruCache } from '../../../src/adapters/render/lruCache.ts';

describe('LRU cache', () => {
  it('evicts the least recently used entry when full', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('keeps null values as hits and replaces an existing key without evicting', () => {
    const cache = new LruCache<number | null>(2);
    cache.set('a', null);
    cache.set('b', 2);
    cache.set('b', 3);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(3);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
