import { describe, expect, it } from 'vitest';
import { LatencyMeter } from '../../../src/services/online/LatencyMeter.ts';
import { LATENCY_MAX_PENDING } from '../../../src/services/online/tuning.ts';

describe('LatencyMeter', () => {
  it('starts with the first round trip and smooths later ones', () => {
    const meter = new LatencyMeter();
    expect(meter.latencyMs(0)).toBeUndefined();
    meter.answered(meter.sent(0.4), 100.4);
    expect(meter.latencyMs(100)).toBe(100);
    meter.answered(meter.sent(1000), 1020);
    expect(meter.latencyMs(1020)).toBe(76);
  });

  it('rises while a ping stays unanswered, so a stalled connection turns slow', () => {
    const meter = new LatencyMeter();
    meter.answered(meter.sent(0), 20);
    meter.sent(1000);
    expect(meter.latencyMs(1010)).toBe(20);
    expect(meter.latencyMs(1500)).toBe(500);
  });

  it('ignores unknown ids, clears older pings with a newer answer and keeps a bounded queue', () => {
    const meter = new LatencyMeter();
    meter.answered(5, 10);
    expect(meter.latencyMs(10)).toBeUndefined();
    let last = 0;
    for (let index = 0; index <= LATENCY_MAX_PENDING; index++) last = meter.sent(index);
    meter.answered(last, LATENCY_MAX_PENDING + 30);
    expect(meter.latencyMs(LATENCY_MAX_PENDING + 30)).toBe(30);
    meter.reset();
    expect(meter.latencyMs(0)).toBeUndefined();
  });
});
