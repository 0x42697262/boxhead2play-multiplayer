import { STAGE_BACKGROUND } from '../../../adapters/render/tuning.ts';
import { SCREEN_PROCESS_TICKS, TRANSITION_STEPS } from './tuning.ts';

export interface TransitionTarget {
  readonly canvas: CanvasImageSource;
}

export type TransitionContext = Pick<CanvasRenderingContext2D, 'globalAlpha' | 'fillStyle' | 'setTransform' | 'fillRect' | 'drawImage'>;

export interface TransitionSize {
  readonly width: number;
  readonly height: number;
}

export class ScreenTransition {
  private ticks = 0;

  constructor(private readonly outgoing: TransitionTarget | undefined) {}

  get steps(): number {
    return Math.min(TRANSITION_STEPS, Math.ceil(this.ticks / SCREEN_PROCESS_TICKS));
  }

  get incomingAlpha(): number {
    return this.steps / TRANSITION_STEPS;
  }

  get done(): boolean {
    return this.steps >= TRANSITION_STEPS;
  }

  tick(): void {
    if (!this.done) this.ticks++;
  }

  draw(ctx: TransitionContext, incoming: CanvasImageSource, size: TransitionSize): void {
    const { width, height } = size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = STAGE_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    if (this.outgoing && !this.done) {
      ctx.globalAlpha = 1 - this.incomingAlpha;
      ctx.drawImage(this.outgoing.canvas, 0, 0, width, height);
    }
    ctx.globalAlpha = this.done ? 1 : this.incomingAlpha;
    ctx.drawImage(incoming, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}
