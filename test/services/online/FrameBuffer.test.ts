import { describe, expect, it } from 'vitest';
import { FrameBuffer, FrameUse } from '../../../src/services/online/FrameBuffer.ts';
import {
  CALM_TICKS_BEFORE_SHRINK,
  MAX_BUFFERED_FRAMES,
  MAX_TARGET_FRAMES,
  MIN_TARGET_FRAMES,
  SURPLUS_TICKS_BEFORE_CATCH_UP,
} from '../../../src/services/online/tuning.ts';

function uses(buffer: FrameBuffer<number>): string[] {
  return buffer.next().map(({ frame, use }) => `${use}:${frame}`);
}

describe('FrameBuffer', () => {
  it('plays each frame on the next tick at the minimum target', () => {
    const buffer = new FrameBuffer<number>();
    expect(buffer.targetFrames).toBe(MIN_TARGET_FRAMES);
    buffer.push(1);
    expect(uses(buffer)).toEqual([`${FrameUse.Live}:1`]);
    buffer.push(2);
    expect(uses(buffer)).toEqual([`${FrameUse.Live}:2`]);
  });

  it('raises the target on an underrun and lowers it again after a calm period', () => {
    const buffer = new FrameBuffer<number>();
    buffer.push(1);
    buffer.next();
    expect(buffer.next()).toEqual([]);
    expect(buffer.targetFrames).toBe(MIN_TARGET_FRAMES + 1);
    buffer.push(2);
    expect(buffer.next()).toEqual([]);
    buffer.push(3);
    expect(uses(buffer)).toEqual([`${FrameUse.Live}:2`]);
    for (let tick = 1; tick < CALM_TICKS_BEFORE_SHRINK; tick++) {
      buffer.push(tick + 3);
      buffer.next();
    }
    expect(buffer.targetFrames).toBe(MIN_TARGET_FRAMES);
  });

  it('never raises the target above the maximum', () => {
    const buffer = new FrameBuffer<number>();
    for (let underrun = 0; underrun < MAX_TARGET_FRAMES + 2; underrun++) {
      for (let frame = 0; frame < buffer.targetFrames; frame++) buffer.push(frame);
      while (buffer.length > 0) buffer.next();
      buffer.next();
    }
    expect(buffer.targetFrames).toBe(MAX_TARGET_FRAMES);
  });

  it('catches up a single surplus frame only when it persists', () => {
    const buffer = new FrameBuffer<number>();
    buffer.push(0);
    buffer.push(1);
    let frame = 2;
    const caughtUp: number[] = [];
    for (let tick = 1; tick <= SURPLUS_TICKS_BEFORE_CATCH_UP; tick++) {
      const scheduled = buffer.next();
      if (scheduled.length > 1) caughtUp.push(tick);
      buffer.push(frame++);
    }
    expect(caughtUp).toEqual([SURPLUS_TICKS_BEFORE_CATCH_UP]);
    expect(buffer.length).toBe(MIN_TARGET_FRAMES);
  });

  it('catches up at once when two or more frames are surplus, and drops beyond the limit', () => {
    const buffer = new FrameBuffer<number>();
    for (let frame = 1; frame <= 3; frame++) buffer.push(frame);
    expect(uses(buffer)).toEqual([`${FrameUse.CaughtUp}:1`, `${FrameUse.Live}:2`]);
    const crowded = new FrameBuffer<number>();
    for (let frame = 1; frame <= MAX_BUFFERED_FRAMES + 1; frame++) crowded.push(frame);
    expect(uses(crowded)).toEqual([`${FrameUse.Dropped}:1`, `${FrameUse.CaughtUp}:2`, `${FrameUse.Live}:3`]);
  });
});
