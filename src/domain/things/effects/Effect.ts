import { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { Thing } from '../Thing.ts';

export abstract class Effect extends Thing {
  constructor(world: WorldContext, position: Position, angle: Angle = new Angle(0), parent?: Thing) {
    super(world, position, parent ? { angle, parent } : { angle });
  }
}

export abstract class InertEffect extends Effect {
  process(): void {
    return;
  }
}
