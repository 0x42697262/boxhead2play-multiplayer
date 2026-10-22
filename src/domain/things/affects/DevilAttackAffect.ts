import type { Angle } from '../../math/Angle.ts';
import type { Thing } from '../Thing.ts';
import { Affect } from './Affect.ts';
import { AffectType } from './AffectType.ts';

export class DevilAttackAffect extends Affect {
  constructor(
    owner: Thing | undefined,
    affector: Thing,
    damage: number,
    readonly hitDirection: Angle,
  ) {
    super(AffectType.DevilAttack, owner, affector, damage);
  }
}
