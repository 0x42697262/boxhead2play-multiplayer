import type { Thing } from '../Thing.ts';
import { Affect } from './Affect.ts';
import { AffectType } from './AffectType.ts';

export class ZombieAttackAffect extends Affect {
  constructor(attacker: Thing, damage: number) {
    super(AffectType.ZombieAttack, attacker, attacker, damage);
  }
}
