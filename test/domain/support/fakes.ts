import { EMPTY_ANIMATION_CATALOG } from '../../../src/domain/animation/AnimationCatalog.ts';
import type { Angle } from '../../../src/domain/math/Angle.ts';
import { Position } from '../../../src/domain/math/Position.ts';
import { SequenceRng, type Rng } from '../../../src/domain/math/Rng.ts';
import type { PlayerHudStatus, PlayerThing } from '../../../src/domain/things/PlayerThing.ts';
import { Thing, type ThingOptions } from '../../../src/domain/things/Thing.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import type { ThingFactory } from '../../../src/domain/things/ThingFactory.ts';
import type { WeaponName } from '../../../src/domain/weapons/WeaponName.ts';
import { InitKind, type RoomDefinition, type RoomInitObject } from '../../../src/domain/world/RoomDefinition.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import {
  createSimulationSettings,
  DEFAULT_GAME_OPTIONS,
  PlayerCharacter,
  type GameOptions,
  type SimulationSettings,
} from '../../../src/domain/world/SimulationSettings.ts';
import { World } from '../../../src/domain/world/World.ts';
import type { WorldContext } from '../../../src/domain/world/WorldContext.ts';

export const CELL = 32;

export class FakeThing extends Thing {
  processed = 0;
  life = 100;

  constructor(
    world: WorldContext,
    position: Position,
    readonly classId: ThingClass = ThingClass.Barrel,
    options: ThingOptions = {},
  ) {
    super(world, position, options);
  }

  process(): void {
    this.processed++;
  }
}

export class FakePlayer extends FakeThing implements PlayerThing {
  maxLife = 200;
  readonly unlocked: WeaponName[] = [];
  resets = 0;
  pickups = 0;
  lastAttackerIndex: number | undefined = undefined;
  lastAttackerClass: ThingClass | undefined = undefined;
  deathLogged = false;

  constructor(
    world: WorldContext,
    position: Position,
    readonly playerIndex: number,
    angle?: Angle,
  ) {
    super(world, position, ThingClass.Player, angle ? { angle } : {});
    this.life = this.maxLife;
  }

  override process(): void {
    super.process();
    this.world.map.mapwho.moveThing(this);
    this.world.trackPlayer(this);
  }

  newWeapon(name: WeaponName): void {
    this.unlocked.push(name);
  }

  resetWeapons(): void {
    this.resets++;
  }

  randomPickup(): boolean {
    this.pickups++;
    return true;
  }

  hudStatus(): PlayerHudStatus {
    return { lifeRatio: this.life / this.maxLife, weaponShortName: 'weapon.pistol.shortName', ammo: undefined, visible: true, respawnTicks: undefined };
  }
}

export interface DroppedPickup {
  readonly thing: FakeThing;
  readonly lifetimeTicks: number;
}

export class FakeFactory implements ThingFactory {
  readonly dropped: DroppedPickup[] = [];
  readonly characters: PlayerCharacter[] = [];

  barrel(world: WorldContext, cellCentre: Position): Thing {
    return new FakeThing(world, cellCentre, ThingClass.Barrel);
  }

  wall(world: WorldContext, cellCentre: Position): Thing {
    return new FakeThing(world, cellCentre, ThingClass.Wall);
  }

  pickup(world: WorldContext, position: Position): Thing {
    return new FakeThing(world, position.cellCentre(), ThingClass.Pickup);
  }

  droppedPickup(world: WorldContext, position: Position, lifetimeTicks: number): Thing {
    const thing = new FakeThing(world, position.cellCentre(), ThingClass.Pickup);
    this.dropped.push({ thing, lifetimeTicks });
    return thing;
  }

  zombie(world: WorldContext, position: Position): Thing {
    return new FakeThing(world, position, ThingClass.Zombie);
  }

  devil(world: WorldContext, position: Position): Thing {
    return new FakeThing(world, position, ThingClass.Devil);
  }

  player(world: WorldContext, position: Position, playerIndex: number, angle: Angle, character: PlayerCharacter): PlayerThing {
    this.characters.push(character);
    return new FakePlayer(world, position, playerIndex, angle);
  }
}

export function cellObject(kind: InitKind, x: number, y: number, order = 0, rotationDegrees = 0): RoomInitObject {
  return {
    order,
    kind,
    positionPx: { x: x * CELL + 1, y: y * CELL + 1 },
    position2Px: { x: (x + 1) * CELL, y: (y + 1) * CELL },
    rotationDegrees,
  };
}

export function solid(x: number, y: number, width: number, height: number, order = 0): RoomInitObject {
  return {
    order,
    kind: InitKind.CollisionSolid,
    positionPx: { x: x * CELL, y: y * CELL },
    position2Px: { x: (x + width) * CELL, y: (y + height) * CELL },
    rotationDegrees: 0,
  };
}

export function room(widthCells: number, heightCells: number, initObjects: RoomInitObject[] = []): RoomDefinition {
  return { id: 'TEST', widthPx: widthCells * CELL, heightPx: heightCells * CELL, initObjects };
}

export interface TestWorldOptions {
  readonly options?: Partial<GameOptions>;
  readonly rng?: Rng;
  readonly spawnRng?: Rng;
  readonly start?: boolean;
}

export const TWO_PLAYERS: readonly PlayerCharacter[] = [PlayerCharacter.Bambo, PlayerCharacter.Swat];

export function settingsWith(options: Partial<GameOptions> = {}): SimulationSettings {
  const multiplayer = options.gameMode !== undefined && options.gameMode !== GameMode.Single;
  const playerCharacters = options.playerCharacters ?? (multiplayer ? TWO_PLAYERS : DEFAULT_GAME_OPTIONS.playerCharacters);
  return createSimulationSettings({ ...DEFAULT_GAME_OPTIONS, ...options, playerCharacters });
}

export function makeWorld(definition: RoomDefinition, test: TestWorldOptions = {}): { world: World; factory: FakeFactory } {
  const factory = new FakeFactory();
  const dependencies = { rng: test.rng ?? new SequenceRng([0]), spawnRng: test.spawnRng ?? new SequenceRng([0]), factory, animations: EMPTY_ANIMATION_CATALOG };
  const settings = settingsWith(test.options);
  const world = test.start === false ? new World(definition, settings, dependencies) : World.create(definition, settings, dependencies);
  return { world, factory };
}

export function at(x: number, y: number, z = 0): Position {
  return new Position(x, y, z);
}

export function place<T extends Thing>(world: World, thing: T, radius = 0.45, flags = 0): T {
  thing.setRadius(radius);
  thing.flags |= flags;
  world.things.add(thing);
  world.map.mapwho.addThing(thing);
  return thing;
}
