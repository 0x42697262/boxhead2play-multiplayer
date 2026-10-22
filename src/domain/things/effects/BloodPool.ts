import { ThingClass } from '../ThingClass.ts';
import { InertEffect } from './Effect.ts';

export class BloodPool extends InertEffect {
  readonly classId = ThingClass.EffectBloodPool;
}
