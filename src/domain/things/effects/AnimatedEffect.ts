import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { animationClip, clipAnimator, type ClipSymbol } from '../clipVisual.ts';
import { Effect } from './Effect.ts';
import { EFFECT_ANIMATION_SPEED } from './tuning.ts';

export abstract class OneShotClipEffect extends Effect {
  protected readonly animator: ClipAnimator;
  private placed = false;

  constructor(
    world: WorldContext,
    position: Position,
    private readonly symbol: ClipSymbol,
    angle?: Angle,
  ) {
    super(world, position, angle);
    this.animator = clipAnimator(world.animations, symbol);
  }

  process(): void {
    if (!this.placed) {
      this.placed = true;
      this.world.map.mapwho.moveThing(this);
    }
    this.step();
    if (this.animator.animate(EFFECT_ANIMATION_SPEED)) this.delete();
  }

  override visual(): Visual {
    return animationClip(this.symbol, this.animator, this.position);
  }

  protected step(): void {
    return;
  }
}
