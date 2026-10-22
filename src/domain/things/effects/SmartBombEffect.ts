import type { Position } from '../../math/Position.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { Effect } from './Effect.ts';
import { SMART_BOMB_LIFE } from './tuning.ts';

export class SmartBombEffect extends Effect {
  readonly classId = ThingClass.EffectSmartBomb;
  private placed = false;

  constructor(
    world: WorldContext,
    position: Position,
    parent: Thing,
    readonly life: number = SMART_BOMB_LIFE,
  ) {
    super(world, position, undefined, parent);
  }

  process(): void {
    if (!this.placed) {
      this.placed = true;
      this.world.map.mapwho.moveThing(this);
    }
    this.delete();
  }
}
