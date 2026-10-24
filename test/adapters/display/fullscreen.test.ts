import { describe, expect, it } from 'vitest';
import { enterLandscapeFullscreen, isHomeScreenCandidate, needsFullscreen, type FullscreenHost } from '../../../src/adapters/display/fullscreen.ts';

function host(enabled: boolean, current: Element | null = null, fail = false) {
  const requests: (FullscreenOptions | undefined)[] = [];
  const value: FullscreenHost = {
    fullscreenEnabled: enabled,
    fullscreenElement: current,
    documentElement: {
      requestFullscreen: (options) => {
        requests.push(options);
        return fail ? Promise.reject(new Error('denied')) : Promise.resolve();
      },
    },
  };
  return { value, requests };
}

describe('fullscreen on touch', () => {
  it('asks for full screen without browser bars, then locks landscape', async () => {
    const { value, requests } = host(true);
    const locks: string[] = [];
    const orientation = { lock: (to: string) => (locks.push(to), Promise.resolve()) };
    expect(await enterLandscapeFullscreen(value, orientation)).toBe(true);
    expect(requests).toEqual([{ navigationUI: 'hide' }]);
    expect(locks).toEqual(['landscape']);
  });

  it('does nothing when full screen is unavailable or already on, and survives refusals', async () => {
    expect(needsFullscreen(host(false).value)).toBe(false);
    expect(needsFullscreen(host(true, {} as Element).value)).toBe(false);
    expect(await enterLandscapeFullscreen(host(false).value, undefined)).toBe(false);
    expect(await enterLandscapeFullscreen(host(true, null, true).value, undefined)).toBe(false);
    const refusing = { lock: () => Promise.reject(new Error('not allowed')) };
    expect(await enterLandscapeFullscreen(host(true).value, refusing)).toBe(true);
    expect(await enterLandscapeFullscreen(host(true).value, {})).toBe(true);
  });

  it('offers the Home Screen only in iPhone Safari, where pages cannot go full screen', () => {
    const navigator = (standalone: boolean | undefined) => ({ standalone }) as unknown as Navigator;
    expect(isHomeScreenCandidate(navigator(false), false)).toBe(true);
    expect(isHomeScreenCandidate(navigator(true), false)).toBe(false);
    expect(isHomeScreenCandidate(navigator(false), true)).toBe(false);
    expect(isHomeScreenCandidate(navigator(undefined), false)).toBe(false);
  });
});
