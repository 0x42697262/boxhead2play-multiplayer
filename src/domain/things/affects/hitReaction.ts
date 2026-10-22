import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { CELL_SIZE_PX } from '../../map/tuning.ts';
import { KNOCKBACK_DAMAGE_DIVISOR, KNOCKBACK_LIMIT, KNOCKBACK_SHOT_FACTOR } from '../tuning.ts';
import type { Affect, Damageable } from './Affect.ts';
import { AffectType } from './AffectType.ts';

export const HitState = {
  BulletHit: 'bulletHit',
  ExplosionHit: 'explosionHit',
  ZombieHit: 'zombieHit',
} as const;

export type HitState = (typeof HitState)[keyof typeof HitState];

export interface HitTarget extends Damageable {
  readonly mass: number;
  readonly isPlayer: boolean;
}

export interface HitReaction {
  readonly state: HitState;
  readonly damage: number;
  readonly delta: Position;
  readonly facingRadians: number;
  readonly hitAngle: Angle;
  readonly stateCount?: number;
}

export function affectorsInProcessingOrder(affectors: readonly Affect[]): Affect[] {
  return affectors.slice().reverse();
}

export function resolveHit(affect: Affect, target: HitTarget, damageActive: boolean): HitReaction | undefined {
  const playerImmune = target.isPlayer && !damageActive;
  switch (affect.type) {
    case AffectType.Bullet:
      return playerImmune ? undefined : shotReaction(affect, target);
    case AffectType.FireBall:
      return shotReaction(affect, target);
    case AffectType.Explosion:
      return playerImmune ? undefined : explosionReaction(affect, target);
    case AffectType.ZombieAttack:
      return zombieReaction(affect, target);
    default:
      return undefined;
  }
}

function shotReaction(affect: Affect, target: HitTarget): HitReaction {
  const damage = affect.affectThing(target);
  const push = (damage / KNOCKBACK_DAMAGE_DIVISOR) * KNOCKBACK_SHOT_FACTOR;
  const delta = knockback(affect, target, Math.max(push / CELL_SIZE_PX, KNOCKBACK_LIMIT) / target.mass);
  return reaction(HitState.BulletHit, damage, delta, affect, Math.round(push));
}

function explosionReaction(affect: Affect, target: HitTarget): HitReaction {
  const damage = affect.affectThing(target);
  const push = (damage / KNOCKBACK_DAMAGE_DIVISOR) * KNOCKBACK_SHOT_FACTOR;
  const delta = knockback(affect, target, Math.min(push / CELL_SIZE_PX / target.mass, KNOCKBACK_LIMIT));
  return reaction(HitState.ExplosionHit, damage, delta, affect, undefined);
}

function zombieReaction(affect: Affect, target: HitTarget): HitReaction {
  const damage = affect.affectThing(target);
  const push = damage / KNOCKBACK_DAMAGE_DIVISOR;
  const delta = knockback(affect, target, Math.max(push / CELL_SIZE_PX / target.mass, KNOCKBACK_LIMIT));
  return reaction(HitState.ZombieHit, damage, delta, affect, Math.round(push));
}

function knockback(affect: Affect, target: HitTarget, length: number): Position {
  const delta = target.position.subtract(affect.affector.position).normalize(length);
  delta.z = 0;
  return delta;
}

function reaction(state: HitState, damage: number, delta: Position, affect: Affect, stateCount: number | undefined): HitReaction {
  const base = {
    state,
    damage,
    delta,
    facingRadians: delta.headingZ() + Math.PI,
    hitAngle: affect.affector.angle.clone(),
  };
  return stateCount === undefined ? base : { ...base, stateCount };
}
