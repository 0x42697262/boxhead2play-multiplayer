import type { Angle } from '../../math/Angle.ts';
import type { Thing } from '../Thing.ts';
import { Affect } from './Affect.ts';
import { AffectType } from './AffectType.ts';

export class FireBallAffect extends Affect {
  constructor(
    owner: Thing | undefined,
    affector: Thing,
    damage: number,
    readonly hitDirection: Angle,
  ) {
    super(AffectType.FireBall, owner, affector, damage);
  }
}
