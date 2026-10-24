import { MS_PER_SECOND } from './FrameClock.ts';

export const UNCAPPED_FRAME_RATE = 0;
export const FRAME_GATE_TOLERANCE = 0.25;

export class FrameGate {
  private lastPresent: number | undefined = undefined;

  shouldPresent(now: number, frameRate: number): boolean {
    if (frameRate === UNCAPPED_FRAME_RATE || this.lastPresent === undefined) {
      this.lastPresent = now;
      return true;
    }
    const interval = MS_PER_SECOND / frameRate;
    const elapsed = now - this.lastPresent;
    if (elapsed < interval * (1 - FRAME_GATE_TOLERANCE)) return false;
    this.lastPresent = elapsed > interval * 2 ? now : this.lastPresent + interval;
    return true;
  }

  reset(): void {
    this.lastPresent = undefined;
  }
}
