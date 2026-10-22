import { CollideMask } from '../map/CollideFlag.ts';
import type { GameMap } from '../map/GameMap.ts';
import type { Position } from '../math/Position.ts';
import { MOVE_IN_DIRECTION_MAX_STEPS } from '../map/tuning.ts';

export function moveInDirection(map: GameMap, position: Position, direction: number): number {
  const cell = map.cellAt(position.x, position.y);
  if (!cell || !(cell.collideFlagsToward(direction) & CollideMask.NonMovable)) return direction;
  for (let step = 1; step <= MOVE_IN_DIRECTION_MAX_STEPS; step++) {
    if (!(cell.collideFlagsToward(direction - step) & CollideMask.NonMovable)) return direction - step;
    if (!(cell.collideFlagsToward(direction + step) & CollideMask.NonMovable)) return direction + step;
  }
  return direction;
}
