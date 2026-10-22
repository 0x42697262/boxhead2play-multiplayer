import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { AffectType } from '../affects/AffectType.ts';
import { animationClip, clipAnimator, ClipSymbol } from '../clipVisual.ts';
import { Explosion } from '../effects/Explosion.ts';
import { RocketSmoke } from '../effects/RocketSmoke.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { Shot } from './Shot.ts';
import { LINE_SHOT_RADIUS, ROCKET } from './tuning.ts';

abstract class Missile extends Shot {
  effect: Explosion;
  private readonly animator: ClipAnimator;
  private launched = false;

  constructor(world: WorldContext, position: Position, angle: Angle, parent: Thing | undefined, damage: number) {
    super(world, position, angle, parent, damage);
    this.animator = clipAnimator(world.animations, ClipSymbol.Rocket);
    this.effect = new Explosion(world, this.position, this.angle, this, this.damage);
  }

  process(): void {
    if (!this.launched) {
      this.launched = true;
      this.delta = this.angle.delta.scale(ROCKET.startSpeed);
      this.world.map.mapwho.moveThing(this);
      this.setRadius(ROCKET.radius);
    }
    if (this.world.rng.int(ROCKET.smokeChoices)) this.world.things.add(new RocketSmoke(this.world, this.position.clone(), this.angle));
    this.delta.scale(ROCKET.acceleration);
    const next = this.position.add(this.delta);
    if (this.world.map.collide.collideLine(this, this.position, next, LINE_SHOT_RADIUS, AffectType.Bullet)) {
      this.explode();
      return;
    }
    this.move(next);
    this.animator.cycle(ROCKET.animationSpeed);
  }

  override visual(): Visual {
    return animationClip(ClipSymbol.Rocket, this.animator, this.position);
  }

  protected abstract explode(): void;
}

export class RocketShot extends Missile {
  readonly classId = ThingClass.ShotRocket;

  protected explode(): void {
    this.delete();
    this.world.things.add(this.effect);
  }
}

export class HomingMissile extends Missile {
  readonly classId = ThingClass.ShotHomingMissile;

  protected explode(): void {
    this.delete();
    this.world.things.add(new Explosion(this.world, this.position, this.angle, this, this.damage));
  }
}
