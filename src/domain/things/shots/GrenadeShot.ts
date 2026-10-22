import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { CELL_SIZE_PX } from '../../map/tuning.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { ClipSymbol, staticClip } from '../clipVisual.ts';
import { Explosion } from '../effects/Explosion.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { bounceStep } from './bounce.ts';
import { Shot } from './Shot.ts';
import { GRENADE } from './tuning.ts';

export class GrenadeShot extends Shot {
  readonly classId = ThingClass.ShotGrenade;
  effect: Explosion;
  life = 0;
  private thrown = false;

  constructor(
    world: WorldContext,
    position: Position,
    angle: Angle,
    parent: Thing | undefined,
    damage: number,
    readonly power: number,
  ) {
    super(world, position, angle, parent, damage);
    this.effect = new Explosion(world, this.position, this.angle, this, this.damage);
  }

  process(): void {
    if (!this.thrown) {
      this.thrown = true;
      this.life = GRENADE.lifeTicks;
      this.position.z = GRENADE.startHeightPx / CELL_SIZE_PX;
      this.delta = this.angle.delta;
      this.delta.z = GRENADE.upwardSpeed;
      this.delta.scale(this.power);
      this.setRadius(GRENADE.radius);
    }
    bounceStep(this);
    if (--this.life === 0) {
      this.world.things.add(this.effect);
      this.delete();
    }
  }

  override visual(): Visual {
    return staticClip(ClipSymbol.Grenade, this.position);
  }
}
