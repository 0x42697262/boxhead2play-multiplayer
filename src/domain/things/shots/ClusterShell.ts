import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { ClipSymbol, staticClip } from '../clipVisual.ts';
import { Explosion } from '../effects/Explosion.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { bounceStep } from './bounce.ts';
import { Shot } from './Shot.ts';
import { CLUSTER_SHELL, GRENADE } from './tuning.ts';

export class ClusterShell extends Shot {
  readonly classId = ThingClass.ShotClusterShell;
  life: number;

  constructor(world: WorldContext, position: Position, angle: Angle, parent: Thing | undefined, damage: number) {
    super(world, position, angle, parent, damage);
    this.life = CLUSTER_SHELL.minLifeTicks + world.rng.int(CLUSTER_SHELL.lifeChoices);
    this.delta = this.angle.delta.scale(CLUSTER_SHELL.minSpeed + world.rng.next() * CLUSTER_SHELL.speedRange);
    this.delta.z = GRENADE.upwardSpeed;
    this.setRadius(GRENADE.radius);
  }

  process(): void {
    bounceStep(this);
    if (--this.life === 0) {
      this.world.things.add(new Explosion(this.world, this.position, this.angle, this, this.damage));
      this.delete();
    }
  }

  override visual(): Visual {
    return staticClip(ClipSymbol.ClusterShell, this.position);
  }
}
