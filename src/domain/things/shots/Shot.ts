import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { Thing } from '../Thing.ts';

export abstract class Shot extends Thing {
  delta: Position;

  constructor(
    world: WorldContext,
    position: Position,
    angle: Angle,
    parent: Thing | undefined,
    public damage: number,
  ) {
    super(world, position, parent ? { angle, parent } : { angle });
    this.delta = angle.delta;
  }
}
