import { STAGE_BACKGROUND } from '../../../adapters/render/tuning.ts';
import { STAGE_HEIGHT_PX, STAGE_WIDTH_PX } from '../../shell/Shell.ts';
import { SCREEN_PROCESS_TICKS, TRANSITION_STEPS } from './tuning.ts';

export interface TransitionTarget {
  readonly canvas: CanvasImageSource;
}

export type TransitionContext = Pick<CanvasRenderingContext2D, 'globalAlpha' | 'fillStyle' | 'setTransform' | 'fillRect' | 'drawImage'>;

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

  draw(ctx: TransitionContext, incoming: CanvasImageSource): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = STAGE_BACKGROUND;
    ctx.fillRect(0, 0, STAGE_WIDTH_PX, STAGE_HEIGHT_PX);
    if (this.outgoing && !this.done) {
      ctx.globalAlpha = 1 - this.incomingAlpha;
      ctx.drawImage(this.outgoing.canvas, 0, 0);
    }
    ctx.globalAlpha = this.done ? 1 : this.incomingAlpha;
    ctx.drawImage(incoming, 0, 0);
    ctx.globalAlpha = 1;
  }
}
