import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { animationClip, clipAnimator, ClipSymbol } from '../clipVisual.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { Effect } from './Effect.ts';
import { EFFECT_ANIMATION_SPEED, SMOKE_DRIFT_SPEED } from './tuning.ts';

export class FireBallHeld extends Effect {
  readonly classId = ThingClass.EffectFireBallHeld;
  readonly drift: Position;
  private readonly animator: ClipAnimator;

  constructor(world: WorldContext, position: Position, angle: Angle, parent?: Thing) {
    super(world, position, angle, parent);
    this.animator = clipAnimator(world.animations, ClipSymbol.FireBall);
    this.animator.randomize(world.rng);
    this.drift = this.angle.delta.scale(SMOKE_DRIFT_SPEED).invert();
  }

  process(): void {
    this.animator.cycle(EFFECT_ANIMATION_SPEED);
  }

  override visual(): Visual {
    return animationClip(ClipSymbol.FireBall, this.animator, this.position);
  }
}
