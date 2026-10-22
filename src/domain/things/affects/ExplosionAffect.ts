import type { Thing } from '../Thing.ts';
import {
  EXPLOSION_EDGE_DAMAGE_FACTOR,
  EXPLOSION_FULL_DAMAGE_RATIO,
  EXPLOSION_MID_DAMAGE_FACTOR,
  EXPLOSION_MID_DAMAGE_RATIO,
} from '../tuning.ts';
import { Affect, type Damageable } from './Affect.ts';
import { AffectType } from './AffectType.ts';

export class ExplosionAffect extends Affect {
  constructor(
    owner: Thing | undefined,
    affector: Thing,
    damage: number,
    readonly range: number,
  ) {
    super(AffectType.Explosion, owner, affector, damage);
  }

  override affectThing(target: Damageable): number {
    const distance = target.position.distance2D(this.affector.position);
    if (distance > this.range) return 0;
    const damage = explosionDamage(this.damage, distance / this.range);
    target.life -= damage;
    return damage;
  }
}

export function explosionDamage(damage: number, distanceRatio: number): number {
  if (distanceRatio <= EXPLOSION_FULL_DAMAGE_RATIO) return damage;
  if (distanceRatio <= EXPLOSION_MID_DAMAGE_RATIO) return damage * EXPLOSION_MID_DAMAGE_FACTOR;
  return damage * EXPLOSION_EDGE_DAMAGE_FACTOR;
}
