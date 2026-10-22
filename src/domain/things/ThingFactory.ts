import type { Angle } from '../math/Angle.ts';
import type { Position } from '../math/Position.ts';
import type { WorldContext } from '../world/WorldContext.ts';
import type { PlayerThing } from './PlayerThing.ts';
import type { Thing } from './Thing.ts';

export interface ThingFactory {
  barrel(world: WorldContext, cellCentre: Position): Thing;
  wall(world: WorldContext, cellCentre: Position): Thing;
  pickup(world: WorldContext, position: Position): Thing;
  droppedPickup(world: WorldContext, position: Position, lifetimeTicks: number): Thing;
  zombie(world: WorldContext, position: Position): Thing;
  devil(world: WorldContext, position: Position): Thing;
  player(world: WorldContext, position: Position, playerIndex: number, angle: Angle): PlayerThing;
}
