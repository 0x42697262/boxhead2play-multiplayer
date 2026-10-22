import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { ClipSymbol } from '../clipVisual.ts';
import { ThingClass } from '../ThingClass.ts';
import { OneShotClipEffect } from './AnimatedEffect.ts';
import { SMOKE_DRIFT_ACCELERATION, SMOKE_DRIFT_SPEED } from './tuning.ts';

export class RocketSmoke extends OneShotClipEffect {
  readonly classId = ThingClass.EffectRocketSmoke;
  private readonly drift: Position;

  constructor(world: WorldContext, position: Position, angle: Angle) {
    super(world, position, ClipSymbol.RocketSmoke, angle);
    this.drift = this.angle.delta.scale(SMOKE_DRIFT_SPEED).invert();
  }

  protected override step(): void {
    this.move(this.position.add(this.drift.scale(SMOKE_DRIFT_ACCELERATION)));
  }
}
