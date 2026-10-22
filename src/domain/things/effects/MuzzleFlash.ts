import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { ClipMode, type ClipVisual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { clipVisual, STATIC_FRAME, type ClipSymbol } from '../clipVisual.ts';
import { ThingClass } from '../ThingClass.ts';
import { Effect } from './Effect.ts';
import { MUZZLE_FLASH_DIRECTIONS } from './tuning.ts';

export class MuzzleFlash extends Effect {
  readonly classId = ThingClass.EffectMuzzleFlash;

  constructor(
    world: WorldContext,
    position: Position,
    angle: Angle,
    readonly symbol: ClipSymbol,
  ) {
    super(world, position, angle);
  }

  process(): void {
    this.world.map.mapwho.moveThing(this);
    this.delete();
  }

  override visual(): ClipVisual {
    return clipVisual(this.symbol, ClipMode.OmniDirectional, STATIC_FRAME, this.position, {
      angleRadians: this.angle.radians,
      rotationCount: MUZZLE_FLASH_DIRECTIONS,
    });
  }
}
