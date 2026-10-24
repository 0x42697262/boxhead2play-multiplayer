import { performance } from 'node:perf_hooks';
import type { CancelTimer, Clock, Ticker, Timers } from '../ports.ts';
import { MAX_CATCH_UP_TICKS, MS_PER_SECOND } from '../tuning.ts';

export const nodeClock: Clock = { now: () => performance.now() };

export const nodeTimers: Timers = {
  after(delayMs, callback) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

export function fixedStepTicker(clock: Clock = nodeClock, timers: Timers = nodeTimers): Ticker {
  return {
    start(ticksPerSecond, onTick) {
      const period = MS_PER_SECOND / ticksPerSecond;
      let next = clock.now() + period;
      let running = true;
      let cancel: CancelTimer | undefined;
      const loop = (): void => {
        if (!running) return;
        const now = clock.now();
        for (let ticks = 0; running && now >= next && ticks < MAX_CATCH_UP_TICKS; ticks++) {
          onTick();
          next += period;
        }
        if (!running) return;
        if (now - next > period * MAX_CATCH_UP_TICKS) next = now + period;
        cancel = timers.after(Math.max(0, next - clock.now()), loop);
      };
      cancel = timers.after(period, loop);
      return () => {
        running = false;
        cancel?.();
      };
    },
  };
}
