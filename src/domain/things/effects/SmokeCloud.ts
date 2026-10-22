import type { Position } from '../../math/Position.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { ClipSymbol } from '../clipVisual.ts';
import { ThingClass } from '../ThingClass.ts';
import { OneShotClipEffect } from './AnimatedEffect.ts';

export class SmokeCloud extends OneShotClipEffect {
  readonly classId = ThingClass.EffectSmokeCloud;

  constructor(world: WorldContext, position: Position) {
    super(world, position, ClipSymbol.SmokeCloud);
  }
}
