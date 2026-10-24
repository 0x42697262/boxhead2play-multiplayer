import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { CellRect } from '../../map/CellRect.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { DevilAttackAffect } from '../affects/DevilAttackAffect.ts';
import { FireBallAffect } from '../affects/FireBallAffect.ts';
import { animationClip, clipAnimator, ClipSymbol } from '../clipVisual.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { Shot } from './Shot.ts';
import { FIREBALL } from './tuning.ts';

export class FireBall extends Shot {
  readonly classId = ThingClass.ShotFireBall;
  private readonly animator: ClipAnimator;
  private initialized = false;

  constructor(
    world: WorldContext,
    position: Position,
    angle: Angle,
    parent: Thing,
    damage: number,
    readonly attacksObject: boolean,
    speed: number = FIREBALL.defaultSpeed,
  ) {
    super(world, position, angle, parent, damage);
    this.animator = clipAnimator(world.animations, ClipSymbol.FireBall);
    this.delta = angle.delta.scale(speed);
  }

  process(): void {
    if (!this.initialized) {
      this.initialized = true;
      this.world.map.mapwho.moveThing(this);
      this.setRadius(this.attacksObject ? FIREBALL.objectRadius : FIREBALL.radius);
    }
    this.delta.scale(FIREBALL.acceleration);
    if (this.world.map.collide.genericCollide(this)) {
      const area = CellRect.around(this.position.x, this.position.y, this.radius);
      const affect = this.attacksObject
        ? new DevilAttackAffect(this.parent, this, FIREBALL.objectDamage, this.angle)
        : new FireBallAffect(this.parent, this, this.damage, this.angle);
      this.world.map.affects.affectArea(area, affect, this.world.map.collide.lastTouched);
      this.delete();
      return;
    }
    this.move(this.position.add(this.delta));
    this.animator.cycle(FIREBALL.animationSpeed);
  }

  override visual(): Visual {
    return animationClip(ClipSymbol.FireBall, this.animator, this.position);
  }
}
