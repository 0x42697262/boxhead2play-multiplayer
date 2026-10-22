import type { Position } from '../../math/Position.ts';
import type { Thing } from '../Thing.ts';
import type { AffectType } from './AffectType.ts';

export interface Damageable {
  life: number;
  readonly position: Position;
}

export class Affect {
  constructor(
    readonly type: AffectType,
    readonly owner: Thing | undefined,
    readonly affector: Thing,
    readonly damage: number,
  ) {}

  affectThing(target: Damageable): number {
    target.life -= this.damage;
    return this.damage;
  }
}
