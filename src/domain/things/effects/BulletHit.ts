import type { Position } from '../../math/Position.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { ClipSymbol } from '../clipVisual.ts';
import { ThingClass } from '../ThingClass.ts';
import { OneShotClipEffect } from './AnimatedEffect.ts';

export class BulletHit extends OneShotClipEffect {
  readonly classId = ThingClass.EffectBulletHit;

  constructor(world: WorldContext, position: Position) {
    super(world, position, ClipSymbol.BulletHit);
  }
}
