import type { AnimationCatalog } from '../../../src/domain/animation/AnimationCatalog.ts';
import { SequenceRng, type Rng } from '../../../src/domain/math/Rng.ts';
import type { Player } from '../../../src/domain/things/creatures/Player.ts';
import { createThingFactory } from '../../../src/domain/things/factory.ts';
import type { Thing } from '../../../src/domain/things/Thing.ts';
import type { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { IDLE_TICK_INPUT, type TickInput } from '../../../src/domain/world/input.ts';
import type { RoomDefinition } from '../../../src/domain/world/RoomDefinition.ts';
import type { GameOptions } from '../../../src/domain/world/SimulationSettings.ts';
import { World } from '../../../src/domain/world/World.ts';
import { syntheticAnimationCatalog } from './animationCatalog.ts';
import { settingsWith } from './fakes.ts';

export interface RealWorldOptions {
  readonly options?: Partial<GameOptions>;
  readonly rng?: Rng;
  readonly spawnRng?: Rng;
  readonly animations?: AnimationCatalog;
}

export function makeRealWorld(definition: RoomDefinition, test: RealWorldOptions = {}): World {
  return World.create(definition, settingsWith(test.options), {
    rng: test.rng ?? new SequenceRng([0.5]),
    spawnRng: test.spawnRng ?? new SequenceRng([0]),
    factory: createThingFactory(),
    animations: test.animations ?? syntheticAnimationCatalog(),
  });
}

export function playerOf(world: World, index = 0): Player {
  const player = world.things.players().find((candidate) => candidate.playerIndex === index);
  if (!player) throw new Error(`No player ${index}`);
  return player as Player;
}

export function spawn<T extends Thing>(world: World, thing: T): T {
  return world.things.add(thing);
}

export function run(world: World, ticks: number, input: TickInput | ((tick: number) => TickInput) = IDLE_TICK_INPUT): void {
  for (let tick = 0; tick < ticks && !world.completion; tick++) world.update(typeof input === 'function' ? input(tick) : input);
}

export function runUntil(world: World, done: () => boolean, maxTicks: number, input: TickInput = IDLE_TICK_INPUT): number {
  for (let tick = 0; tick < maxTicks; tick++) {
    if (done()) return tick;
    world.update(input);
  }
  return maxTicks;
}

export function ofClass(world: World, classId: ThingClass): Thing[] {
  return world.things.newestFirst().filter((thing) => thing.classId === classId);
}
