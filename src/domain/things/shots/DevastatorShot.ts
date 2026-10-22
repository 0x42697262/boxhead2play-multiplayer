import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { CollideMask } from '../../map/CollideFlag.ts';
import { LineHitKind } from '../../map/MapCell.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { AffectType } from '../affects/AffectType.ts';
import { animationClip, clipAnimator, ClipSymbol } from '../clipVisual.ts';
import { Explosion } from '../effects/Explosion.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { Shot } from './Shot.ts';
import { DEVASTATOR, LINE_SHOT_RADIUS, ROCKET } from './tuning.ts';

const QUARTER_TURN = Math.PI / 2;

export class DevastatorShot extends Shot {
  readonly classId = ThingClass.ShotDevastator;
  counter = 0;
  private readonly animator: ClipAnimator;
  private launched = false;

  constructor(world: WorldContext, position: Position, angle: Angle, parent: Thing | undefined, damage: number) {
    super(world, position, angle, parent, damage);
    this.animator = clipAnimator(world.animations, ClipSymbol.Devastator);
    this.delta = this.angle.delta.scale(DEVASTATOR.speed);
  }

  process(): void {
    if (!this.launched) {
      this.launched = true;
      this.world.map.mapwho.moveThing(this);
      this.setRadius(DEVASTATOR.radius);
    }
    const next = this.position.add(this.delta);
    const hit = this.world.map.collide.collideLine(this, this.position, next, LINE_SHOT_RADIUS, AffectType.Bullet);
    if (hit?.kind === LineHitKind.Wall) {
      this.delete();
      return;
    }
    if (!(this.counter++ % DEVASTATOR.linePeriod) && this.counter >= DEVASTATOR.firstLineCounter) {
      this.fireLine(this.angle.clone().add(QUARTER_TURN));
      this.fireLine(this.angle.clone().subtract(QUARTER_TURN));
    }
    this.move(next);
    this.animator.cycle(ROCKET.animationSpeed);
  }

  override visual(): Visual {
    return animationClip(ClipSymbol.Devastator, this.animator, this.position);
  }

  private fireLine(direction: Angle): void {
    const step = direction.delta.scale(DEVASTATOR.lineStartCells);
    let point = this.position.add(step);
    point.z = 0;
    step.scale(DEVASTATOR.lineStepFactor);
    for (let remaining = DEVASTATOR.lineExplosions; remaining > 0; remaining--) {
      if (this.world.map.collideAt(point.x, point.y) & CollideMask.StaticImpassable) break;
      this.world.things.add(new Explosion(this.world, point, this.angle.clone(), this, DEVASTATOR.lineDamage));
      point = point.add(step);
    }
  }
}
