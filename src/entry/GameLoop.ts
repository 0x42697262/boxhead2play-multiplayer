import type { ScreenFlow } from '../services/ScreenFlow.ts';
import { FrameClock } from './FrameClock.ts';
import { FrameGate, UNCAPPED_FRAME_RATE } from './FrameGate.ts';

export const IDLE_BUDGET_MS = 6;

export interface LoopClock {
  now(): number;
  requestFrame(callback: (now: number) => void): void;
}

export const browserLoopClock: LoopClock = {
  now: () => performance.now(),
  requestFrame: (callback) => {
    requestAnimationFrame(callback);
  },
};

export class GameLoop {
  private readonly clock = new FrameClock();
  private readonly gate = new FrameGate();
  private seenVersion = -1;
  private running = false;

  constructor(
    private readonly flow: ScreenFlow,
    private readonly time: LoopClock = browserLoopClock,
    private readonly frameRate: () => number = () => UNCAPPED_FRAME_RATE,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.time.requestFrame((now) => this.frame(now));
  }

  resetTiming(): void {
    this.clock.reset(this.time.now());
  }

  frame(now: number): void {
    if (this.flow.version !== this.seenVersion) {
      this.seenVersion = this.flow.version;
      this.clock.reset(now);
      this.gate.reset();
    }
    const ticks = this.clock.process(now, this.flow.ticksPerSecond);
    for (let tick = 0; tick < ticks; tick++) this.flow.tick();
    if (this.gate.shouldPresent(now, this.frameRate())) this.flow.present();
    const deadline = now + IDLE_BUDGET_MS;
    this.flow.idle(() => this.time.now() < deadline);
    if (this.running) this.time.requestFrame((next) => this.frame(next));
  }
}
