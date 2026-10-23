import { performance } from 'node:perf_hooks';
import type { Clock, Ticker, Timers } from '../ports.ts';
import { MAX_CATCH_UP_TICKS, MS_PER_SECOND } from '../tuning.ts';

export const nodeClock: Clock = { now: () => performance.now() };

export const nodeTimers: Timers = {
  after(delayMs, callback) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

export function fixedStepTicker(clock: Clock = nodeClock): Ticker {
  return {
    start(ticksPerSecond, onTick) {
      const period = MS_PER_SECOND / ticksPerSecond;
      let next = clock.now() + period;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = true;
      const loop = (): void => {
        if (!running) return;
        const now = clock.now();
        let ticks = 0;
        while (now >= next && ticks < MAX_CATCH_UP_TICKS) {
          onTick();
          next += period;
          ticks++;
        }
        if (now - next > period * MAX_CATCH_UP_TICKS) next = now + period;
        timer = setTimeout(loop, Math.max(0, next - clock.now()));
      };
      timer = setTimeout(loop, period);
      return () => {
        running = false;
        clearTimeout(timer);
      };
    },
  };
}
