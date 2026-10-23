import { Devil } from './creatures/Devil.ts';
import { Player } from './creatures/Player.ts';
import { Zombie } from './creatures/Zombie.ts';
import { Barrel } from './objects/Barrel.ts';
import { Pickup } from './objects/Pickup.ts';
import { Wall } from './objects/Wall.ts';
import type { ThingFactory } from './ThingFactory.ts';

export function createThingFactory(): ThingFactory {
  return {
    barrel: (world, cellCentre) => new Barrel(world, cellCentre),
    wall: (world, cellCentre) => new Wall(world, cellCentre),
    pickup: (world, position) => new Pickup(world, position),
    droppedPickup: (world, position, lifetimeTicks) => Pickup.dropped(world, position, lifetimeTicks),
    zombie: (world, position) => new Zombie(world, position),
    devil: (world, position) => new Devil(world, position),
    player: (world, position, playerIndex, angle, character) => new Player(world, position, playerIndex, angle, character),
  };
}
