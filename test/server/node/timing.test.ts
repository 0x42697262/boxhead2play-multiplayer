import { describe, expect, it } from 'vitest';
import type { Clock, Timers } from '../../../src/server/ports.ts';
import { fixedStepTicker } from '../../../src/server/node/timing.ts';
import { MAX_CATCH_UP_TICKS, MS_PER_SECOND } from '../../../src/server/tuning.ts';

const TICKS_PER_SECOND = 25;
const PERIOD_MS = MS_PER_SECOND / TICKS_PER_SECOND;
const STALL_MS = 1000;

interface Pending {
  readonly at: number;
  readonly callback: () => void;
  cancelled: boolean;
}

class ManualTime implements Clock, Timers {
  private time = 0;
  private pending: Pending[] = [];

  now(): number {
    return this.time;
  }

  after(delayMs: number, callback: () => void): () => void {
    const timer: Pending = { at: this.time + delayMs, callback, cancelled: false };
    this.pending.push(timer);
    return () => {
      timer.cancelled = true;
    };
  }

  get armed(): number {
    return this.pending.filter((timer) => !timer.cancelled).length;
  }

  stall(ms: number): void {
    this.time += ms;
  }

  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      this.pending = this.pending.filter((timer) => !timer.cancelled);
      const due = this.pending.filter((timer) => timer.at <= end).sort((first, second) => first.at - second.at)[0];
      if (!due) break;
      this.pending.splice(this.pending.indexOf(due), 1);
      this.time = Math.max(this.time, due.at);
      due.callback();
    }
    this.time = end;
  }
}

describe('fixed step ticker', () => {
  it('ticks once per period while the loop keeps up', () => {
    const time = new ManualTime();
    let ticks = 0;
    fixedStepTicker(time, time).start(TICKS_PER_SECOND, () => ticks++);
    time.advance(PERIOD_MS * 10);
    expect(ticks).toBe(10);
  });

  it('catches up at most a few ticks after a stall, then resyncs to the clock', () => {
    const time = new ManualTime();
    let ticks = 0;
    fixedStepTicker(time, time).start(TICKS_PER_SECOND, () => ticks++);
    time.stall(STALL_MS);
    time.advance(0);
    expect(ticks).toBe(MAX_CATCH_UP_TICKS);
    time.advance(PERIOD_MS);
    expect(ticks).toBe(MAX_CATCH_UP_TICKS + 1);
    time.advance(PERIOD_MS * 4);
    expect(ticks).toBe(MAX_CATCH_UP_TICKS + 5);
  });

  it('stops in the middle of a catch-up burst and does not schedule again', () => {
    const time = new ManualTime();
    let ticks = 0;
    const stopAt = 2;
    const stop = fixedStepTicker(time, time).start(TICKS_PER_SECOND, () => {
      ticks++;
      if (ticks === stopAt) stop();
    });
    time.stall(STALL_MS);
    time.advance(0);
    expect(ticks).toBe(stopAt);
    expect(time.armed).toBe(0);
    time.advance(STALL_MS);
    expect(ticks).toBe(stopAt);
  });

  it('cancels the pending timer when stopped between ticks', () => {
    const time = new ManualTime();
    let ticks = 0;
    const stop = fixedStepTicker(time, time).start(TICKS_PER_SECOND, () => ticks++);
    time.advance(PERIOD_MS);
    stop();
    expect(time.armed).toBe(0);
    time.advance(STALL_MS);
    expect(ticks).toBe(1);
  });
});
