import { describe, expect, it } from 'vitest';
import { TouchLayout } from '../../../src/services/ScreenFlow.ts';
import { entersFullscreenOnTap } from '../../../src/ui/mobile/fullscreenTap.ts';

describe('full screen on a tap', () => {
  it('enters full screen from menu screens, which report no touch layout', () => {
    expect(entersFullscreenOnTap(undefined)).toBe(true);
    expect(entersFullscreenOnTap(TouchLayout.Hidden)).toBe(true);
  });

  it('enters full screen from the in-game Esc menu', () => {
    expect(entersFullscreenOnTap(TouchLayout.Menu)).toBe(true);
  });

  it('never enters full screen while the game is played', () => {
    expect(entersFullscreenOnTap(TouchLayout.Play)).toBe(false);
  });
});
