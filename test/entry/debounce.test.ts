import { describe, expect, it } from 'vitest';
import { debounce, type DelayTimers } from '../../src/entry/debounce.ts';

class ManualTimers implements DelayTimers {
  private readonly pending = new Map<number, { readonly run: () => void; readonly dueMs: number }>();
  private nextHandle = 1;
  nowMs = 0;

  start(run: () => void, delayMs: number): number {
    const handle = this.nextHandle++;
    this.pending.set(handle, { run, dueMs: this.nowMs + delayMs });
    return handle;
  }

  cancel(handle: number): void {
    this.pending.delete(handle);
  }

  advance(ms: number): void {
    this.nowMs += ms;
    for (const [handle, timer] of [...this.pending]) {
      if (timer.dueMs > this.nowMs) continue;
      this.pending.delete(handle);
      timer.run();
    }
  }
}

const DELAY_MS = 250;

describe('debounce', () => {
  it('runs once, a delay after the last call of a burst', () => {
    const timers = new ManualTimers();
    let runs = 0;
    const settle = debounce(() => runs++, DELAY_MS, timers);
    settle();
    timers.advance(DELAY_MS - 1);
    settle();
    timers.advance(DELAY_MS - 1);
    settle();
    expect(runs).toBe(0);
    timers.advance(DELAY_MS);
    expect(runs).toBe(1);
  });

  it('runs again for a later burst', () => {
    const timers = new ManualTimers();
    let runs = 0;
    const settle = debounce(() => runs++, DELAY_MS, timers);
    settle();
    timers.advance(DELAY_MS);
    settle();
    timers.advance(DELAY_MS);
    expect(runs).toBe(2);
  });
});
