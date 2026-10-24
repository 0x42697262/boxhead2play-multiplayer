import { describe, expect, it } from 'vitest';
import { requestPathname } from '../../../src/server/node/requestPath.ts';

describe('request pathname', () => {
  it('returns the path without the query', () => {
    expect(requestPathname('/__monitor?x=1')).toBe('/__monitor');
    expect(requestPathname(undefined)).toBe('/');
  });

  it('returns nothing for a URL that does not parse', () => {
    expect(requestPathname('//[')).toBeUndefined();
  });
});
