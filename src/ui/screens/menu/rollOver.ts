import type { Filter } from '../../../adapters/assets/schemas.ts';
import { DEGREES_PER_HALF_TURN } from '../../../adapters/render/tuning.ts';
import type { Rng } from '../../../domain/math/Rng.ts';
import { ROLL_OVER_BLUR, ROLL_OVER_SHADOW } from './tuning.ts';

export function rollOverFilters(rng: Rng): Filter[] {
  const distance = rng.next() * ROLL_OVER_SHADOW.maxDistance;
  const angleDegrees = rng.int(ROLL_OVER_SHADOW.angleChoices);
  const blurX = rng.next() * ROLL_OVER_BLUR.max;
  const blurY = rng.next() * ROLL_OVER_BLUR.max;
  return [
    {
      type: 'dropShadow',
      distance,
      angle: (angleDegrees * Math.PI) / DEGREES_PER_HALF_TURN,
      dropShadowColor: ROLL_OVER_SHADOW.color,
      blurX: ROLL_OVER_SHADOW.blur,
      blurY: ROLL_OVER_SHADOW.blur,
      strength: ROLL_OVER_SHADOW.strength,
      passes: ROLL_OVER_SHADOW.quality,
      innerShadow: false,
      knockout: false,
      compositeSource: true,
    },
    { type: 'blur', blurX, blurY, passes: ROLL_OVER_BLUR.quality },
  ];
}
