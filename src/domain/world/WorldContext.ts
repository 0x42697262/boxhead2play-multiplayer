import type { AnimationCatalog } from '../animation/AnimationCatalog.ts';
import type { EventSink, Point3 } from '../events.ts';
import type { HudState } from '../hud/HudState.ts';
import type { Rng } from '../math/Rng.ts';
import type { GameMap } from '../map/GameMap.ts';
import type { PlayerThing } from '../things/PlayerThing.ts';
import type { Thing } from '../things/Thing.ts';
import type { ThingCollection } from '../things/ThingCollection.ts';
import type { ThingFactory } from '../things/ThingFactory.ts';
import type { ThingIds } from '../things/ThingIds.ts';
import type { Upgrades } from '../upgrades/Upgrades.ts';
import type { PlayerInput } from './input.ts';
import type { SimulationSettings } from './SimulationSettings.ts';
import type { SpawnPoint } from './spawning.ts';

export interface WorldContext {
  readonly settings: SimulationSettings;
  readonly rng: Rng;
  readonly events: EventSink;
  readonly animations: AnimationCatalog;
  readonly projectionFactor: number;
  readonly map: GameMap;
  readonly things: ThingCollection;
  readonly ids: ThingIds;
  readonly factory: ThingFactory;
  readonly upgrades: Upgrades;
  readonly hud: HudState;
  readonly tick: number;
  readonly ticksPerSecond: number;
  input(playerIndex: number): PlayerInput;
  logKill(thing: Thing): void;
  playerDead(): void;
  trackPlayer(player: PlayerThing): void;
  shake(source: Point3, dx: number, dy: number): void;
  flashBrightness(source: Point3, level: number): void;
  playerRespawnPoint(): SpawnPoint | undefined;
}
