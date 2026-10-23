export const MS_PER_SECOND = 1000;
export const FRAME_CAP = 1;

export class FrameClock {
  private timeSlice: number | undefined = undefined;

  constructor(private readonly frameCap: number = FRAME_CAP) {}

  process(now: number, ticksPerSecond: number): number {
    const interval = MS_PER_SECOND / ticksPerSecond;
    this.timeSlice ??= now;
    const ticks = Math.floor((now - this.timeSlice) / interval);
    if (ticks <= 0) return 0;
    this.timeSlice += ticks * interval;
    return Math.min(ticks, this.frameCap);
  }

  reset(now: number): void {
    this.timeSlice = now;
  }
}
