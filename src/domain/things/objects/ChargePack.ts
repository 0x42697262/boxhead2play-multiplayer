import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { ClipSymbol } from '../clipVisual.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { ExplosivePhase, PlacedExplosive } from './Mine.ts';
import { CHARGE_PACK } from './tuning.ts';

export class ChargePack extends PlacedExplosive {
  readonly classId = ThingClass.ChargePack;
  detonateRequested = false;

  constructor(world: WorldContext, position: Position, angle: Angle, parent?: Thing, damage: number = CHARGE_PACK.defaultDamage) {
    super(world, position, angle, parent, damage, ClipSymbol.ChargePack, CHARGE_PACK.detonateAnimationSpeed);
  }

  process(): void {
    switch (this.phase) {
      case ExplosivePhase.Init:
        this.place();
        this.phase = ExplosivePhase.Armed;
        this.watch();
        return;
      case ExplosivePhase.Detonating:
        this.detonate();
        return;
      default:
        this.watch();
        return;
    }
  }

  private watch(): void {
    this.animator.cycle(CHARGE_PACK.idleFramesPerSecond / this.world.ticksPerSecond);
    if (this.detonateRequested) this.startDetonation(this.world.ticksPerSecond / CHARGE_PACK.detonateSecondsDivisor);
  }
}
