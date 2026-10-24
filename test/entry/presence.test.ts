import { describe, expect, it } from 'vitest';
import { AudioChange, freezes, isAway, presenceEffects, type Presence } from '../../src/entry/presence.ts';
import { Simulation } from '../../src/services/ScreenFlow.ts';

const LANDSCAPE: Presence = { hidden: false, portrait: false };
const UPRIGHT: Presence = { hidden: false, portrait: true };
const HIDDEN: Presence = { hidden: true, portrait: false };
const HIDDEN_UPRIGHT: Presence = { hidden: true, portrait: true };

describe('presence', () => {
  it('is away while the page is hidden or the phone is upright', () => {
    expect(isAway(LANDSCAPE)).toBe(false);
    expect(isAway(UPRIGHT)).toBe(true);
    expect(isAway(HIDDEN)).toBe(true);
    expect(isAway(HIDDEN_UPRIGHT)).toBe(true);
  });

  it('freezes only single play while away; online and menus keep running', () => {
    expect(freezes(UPRIGHT, Simulation.Local)).toBe(true);
    expect(freezes(HIDDEN, Simulation.Local)).toBe(true);
    expect(freezes(LANDSCAPE, Simulation.Local)).toBe(false);
    expect(freezes(UPRIGHT, Simulation.Shared)).toBe(false);
    expect(freezes(UPRIGHT, undefined)).toBe(false);
  });

  it('releases keys once when the player goes away, in every mode', () => {
    for (const simulation of [Simulation.Local, Simulation.Shared, undefined]) {
      expect(presenceEffects(LANDSCAPE, UPRIGHT, simulation).releaseKeys).toBe(true);
      expect(presenceEffects(LANDSCAPE, HIDDEN, simulation).releaseKeys).toBe(true);
      expect(presenceEffects(UPRIGHT, HIDDEN_UPRIGHT, simulation).releaseKeys).toBe(false);
      expect(presenceEffects(UPRIGHT, LANDSCAPE, simulation).releaseKeys).toBe(false);
    }
  });

  it('resets the loop timing when the page becomes visible again', () => {
    expect(presenceEffects(HIDDEN, LANDSCAPE, Simulation.Local).resetTiming).toBe(true);
    expect(presenceEffects(HIDDEN_UPRIGHT, UPRIGHT, Simulation.Local).resetTiming).toBe(true);
    expect(presenceEffects(UPRIGHT, LANDSCAPE, Simulation.Local).resetTiming).toBe(false);
    expect(presenceEffects(LANDSCAPE, HIDDEN, Simulation.Local).resetTiming).toBe(false);
  });

  it('silences a frozen single play and a hidden page, and resumes only when visible and in landscape', () => {
    expect(presenceEffects(LANDSCAPE, UPRIGHT, Simulation.Local).audio).toBe(AudioChange.Suspend);
    expect(presenceEffects(UPRIGHT, HIDDEN_UPRIGHT, Simulation.Local).audio).toBe(AudioChange.Keep);
    expect(presenceEffects(HIDDEN_UPRIGHT, UPRIGHT, Simulation.Local).audio).toBe(AudioChange.Keep);
    expect(presenceEffects(UPRIGHT, LANDSCAPE, Simulation.Local).audio).toBe(AudioChange.Resume);
    expect(presenceEffects(LANDSCAPE, UPRIGHT, Simulation.Shared).audio).toBe(AudioChange.Keep);
    expect(presenceEffects(UPRIGHT, HIDDEN_UPRIGHT, Simulation.Shared).audio).toBe(AudioChange.Suspend);
    expect(presenceEffects(HIDDEN_UPRIGHT, UPRIGHT, Simulation.Shared).audio).toBe(AudioChange.Resume);
    expect(presenceEffects(LANDSCAPE, HIDDEN, undefined).audio).toBe(AudioChange.Suspend);
    expect(presenceEffects(HIDDEN, LANDSCAPE, undefined).audio).toBe(AudioChange.Resume);
  });
});
