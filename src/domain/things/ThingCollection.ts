import type { Position } from '../math/Position.ts';
import type { GameMap } from '../map/GameMap.ts';
import type { MapCell } from '../map/MapCell.ts';
import type { PlayerThing } from './PlayerThing.ts';
import type { Thing } from './Thing.ts';
import { ThingClass } from './ThingClass.ts';
import { ThingFlag } from './ThingFlag.ts';

export class ThingCollection {
  private readonly living = new Map<string, Thing>();
  private readonly playerThings = new Map<string, PlayerThing>();
  private readonly counters = new Map<ThingClass, number>();
  private pendingDeletes = new Map<string, Thing>();

  constructor(private readonly map: GameMap) {
    map.navigation.reset();
  }

  get size(): number {
    return this.living.size;
  }

  count(classId: ThingClass): number {
    return this.counters.get(classId) ?? 0;
  }

  newestFirst(): Thing[] {
    return [...this.living.values()].reverse();
  }

  some(predicate: (thing: Thing) => boolean): boolean {
    for (const thing of this.living.values()) if (predicate(thing)) return true;
    return false;
  }

  filter(predicate: (thing: Thing) => boolean): Thing[] {
    const matches: Thing[] = [];
    for (const thing of this.living.values()) if (predicate(thing)) matches.push(thing);
    return matches;
  }

  players(): PlayerThing[] {
    return [...this.playerThings.values()].reverse();
  }

  add<T extends Thing>(thing: T): T {
    this.living.set(thing.key, thing);
    this.counters.set(thing.classId, this.count(thing.classId) + 1);
    return thing;
  }

  addPlayer(player: PlayerThing): PlayerThing {
    this.add(player);
    this.playerThings.set(player.key, player);
    return player;
  }

  deleteThing(thing: Thing): void {
    this.counters.set(thing.classId, this.count(thing.classId) - 1);
    this.pendingDeletes.set(thing.key, thing);
    this.playerThings.delete(thing.key);
  }

  closestPlayer(position?: Position): PlayerThing | undefined {
    const players = this.players();
    if (this.count(ThingClass.Player) === 1 || !position) return players[0];
    let best: PlayerThing | undefined;
    let bestDistance = Number.MAX_VALUE;
    for (const player of players) {
      if (player.hasFlag(ThingFlag.Dead)) continue;
      const distance = position.distance2DSquared(player.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    }
    return best ?? players[0];
  }

  playerByIndex(playerIndex: number): PlayerThing | undefined {
    return this.players().find((player) => player.playerIndex === playerIndex);
  }

  process(): void {
    this.flushDeletes();
    for (const thing of this.newestFirst()) {
      if (thing.isProcessing) thing.process();
    }
    this.map.navigation.restart();
    this.map.navigation.update(this.navigationSources());
  }

  private flushDeletes(): void {
    for (const thing of [...this.pendingDeletes.values()].reverse()) {
      thing.dispose();
      this.living.delete(thing.key);
    }
    this.pendingDeletes = new Map();
  }

  private navigationSources(): MapCell[] {
    const sources: MapCell[] = [];
    for (const player of this.players()) {
      const cell = this.map.cellAt(player.position.x, player.position.y);
      if (cell) sources.push(cell);
    }
    return sources;
  }
}
