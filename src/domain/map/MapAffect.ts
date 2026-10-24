import type { Position } from '../math/Position.ts';
import type { Affect } from '../things/affects/Affect.ts';
import type { Thing } from '../things/Thing.ts';
import { CellRect } from './CellRect.ts';
import type { GameMap } from './GameMap.ts';
import { LineProbe, LineTest } from './LineProbe.ts';
import { LINE_STEP_CELLS } from './tuning.ts';

export class MapAffect {
  constructor(private readonly map: GameMap) {}

  affectArea(area: CellRect, affect: Affect, touched: readonly Thing[] = []): void {
    const affected = new Set<Thing>();
    for (const cell of this.map.cellsInArea(area)) {
      if (cell.childCount === 0) continue;
      for (const thing of cell.newestFirst()) {
        affected.add(thing);
        if (thing.affectFlags & affect.type && affect.affector.id !== thing.id) thing.affect(affect);
      }
    }
    for (const thing of touched) {
      if (!affected.has(thing) && thing.affectFlags & affect.type && affect.affector.id !== thing.id) thing.affect(affect);
    }
  }

  affectLine(owner: Thing, from: Position, to: Position, radius: number, affect: Affect): number {
    const span = to.subtract(from);
    let remaining = span.length / LINE_STEP_CELLS;
    const area = CellRect.around(from.x, from.y, radius);
    const stepX = span.x / remaining;
    const stepY = span.y / remaining;
    const line = new LineProbe(from.x, from.y, to.x, to.y, owner.id, affect.type, LineTest.ThingsAndWalls);
    const session = this.map.nextSessionId();
    const hits: Thing[] = [];
    while (remaining > 0) {
      hits.push(...this.thingsOnLine(area, line, session));
      remaining -= LINE_STEP_CELLS;
      area.x += stepX;
      area.y += stepY;
    }
    area.x = to.x;
    area.y = to.y;
    hits.push(...this.thingsOnLine(area, line, session));
    for (const thing of hits.slice().reverse()) {
      if (thing.affectFlags & affect.type && affect.affector.id !== thing.id) thing.affect(affect);
    }
    return hits.length;
  }

  private thingsOnLine(area: CellRect, line: LineProbe, session: number): Thing[] {
    const found: Thing[] = [];
    for (const cell of this.map.cellsInAreaOncePerSession(area, session)) {
      const hits = cell.lineIntersectionThings(line);
      if (hits) found.push(...hits);
    }
    return found;
  }
}
