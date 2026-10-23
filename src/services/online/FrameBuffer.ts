import {
  CALM_TICKS_BEFORE_SHRINK,
  CATCH_UP_SURPLUS_FRAMES,
  MAX_BUFFERED_FRAMES,
  MAX_TARGET_FRAMES,
  MIN_TARGET_FRAMES,
  SURPLUS_TICKS_BEFORE_CATCH_UP,
} from './tuning.ts';

export const FrameUse = {
  Live: 'live',
  CaughtUp: 'caughtUp',
  Dropped: 'dropped',
} as const;

export type FrameUse = (typeof FrameUse)[keyof typeof FrameUse];

export interface ScheduledFrame<T> {
  readonly frame: T;
  readonly use: FrameUse;
}

export class FrameBuffer<T> {
  private readonly queue: T[] = [];
  private primed = false;
  private target = MIN_TARGET_FRAMES;
  private calmTicks = 0;
  private surplusTicks = 0;

  get length(): number {
    return this.queue.length;
  }

  get targetFrames(): number {
    return this.target;
  }

  push(frame: T): void {
    this.queue.push(frame);
  }

  clear(): void {
    this.queue.length = 0;
  }

  next(): ScheduledFrame<T>[] {
    if (!this.primed) {
      if (this.queue.length < this.target) return [];
      this.primed = true;
    }
    if (this.queue.length === 0) {
      this.underrun();
      return [];
    }
    const scheduled: ScheduledFrame<T>[] = [];
    while (this.queue.length > MAX_BUFFERED_FRAMES) this.take(scheduled, FrameUse.Dropped);
    if (this.shouldCatchUp()) this.take(scheduled, FrameUse.CaughtUp);
    this.take(scheduled, FrameUse.Live);
    this.settle();
    return scheduled;
  }

  private shouldCatchUp(): boolean {
    const surplus = this.queue.length - this.target;
    this.surplusTicks = surplus > 0 ? this.surplusTicks + 1 : 0;
    if (surplus < 1) return false;
    if (surplus < CATCH_UP_SURPLUS_FRAMES && this.surplusTicks < SURPLUS_TICKS_BEFORE_CATCH_UP) return false;
    this.surplusTicks = 0;
    return true;
  }

  private take(scheduled: ScheduledFrame<T>[], use: FrameUse): void {
    const frame = this.queue.shift();
    if (frame !== undefined) scheduled.push({ frame, use });
  }

  private underrun(): void {
    this.primed = false;
    this.target = Math.min(this.target + 1, MAX_TARGET_FRAMES);
    this.calmTicks = 0;
    this.surplusTicks = 0;
  }

  private settle(): void {
    this.calmTicks++;
    if (this.calmTicks < CALM_TICKS_BEFORE_SHRINK || this.target <= MIN_TARGET_FRAMES) return;
    this.target--;
    this.calmTicks = 0;
  }
}
