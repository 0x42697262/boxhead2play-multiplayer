import type { Thing } from '../things/Thing.ts';
import type { GameMap } from './GameMap.ts';

export class Mapwho {
  constructor(private readonly map: GameMap) {}

  moveThing(thing: Thing): boolean {
    const x = Math.trunc(thing.position.x);
    const y = Math.trunc(thing.position.y);
    const current = thing.cellId;
    if (current && current.x === x && current.y === y) return false;
    if (current) this.map.cellAt(current.x, current.y)?.deleteThing(thing);
    const cell = this.map.cellAt(x, y);
    cell?.addThing(thing);
    thing.cellId = cell ? { x: cell.x, y: cell.y } : undefined;
    return true;
  }

  addThing(thing: Thing): void {
    const cell = this.map.cellAt(Math.trunc(thing.position.x), Math.trunc(thing.position.y));
    cell?.addThing(thing);
    thing.cellId = cell ? { x: cell.x, y: cell.y } : undefined;
  }

  deleteThing(thing: Thing): void {
    const current = thing.cellId;
    if (!current) return;
    this.map.cellAt(current.x, current.y)?.deleteThing(thing);
    thing.cellId = undefined;
  }
}
