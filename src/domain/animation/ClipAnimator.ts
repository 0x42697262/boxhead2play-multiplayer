import type { Rng } from '../math/Rng.ts';

const FRAME_WRAP_TURNS = 10;

export const ClipEnd = {
  PastLast: 'pastLast',
  OnLast: 'onLast',
} as const;

export type ClipEnd = (typeof ClipEnd)[keyof typeof ClipEnd];

export class ClipAnimator {
  private position = 0;
  private shown = 0;

  constructor(
    readonly frameCount: number,
    private readonly end: ClipEnd = ClipEnd.PastLast,
  ) {}

  get frame(): number {
    return this.shown;
  }

  get animationPosition(): number {
    return this.position;
  }

  animate(speed: number): boolean {
    this.position += speed;
    if (this.position >= this.frameCount) {
      const last = this.frameCount - 1;
      this.position = this.end === ClipEnd.PastLast ? this.frameCount : last;
      this.shown = last;
      return true;
    }
    this.shown = Math.floor(this.position);
    return false;
  }

  cycle(speed: number): void {
    this.position = (this.position + speed) % this.frameCount;
    this.shown = Math.floor(this.position);
  }

  randomize(rng: Rng): void {
    this.position = rng.int(this.frameCount);
    this.shown = Math.floor(this.position);
  }

  goTo(frame: number): void {
    this.position = (frame + this.frameCount * FRAME_WRAP_TURNS) % this.frameCount;
    this.shown = Math.floor(this.position);
  }
}
