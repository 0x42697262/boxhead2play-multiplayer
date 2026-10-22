import type { Position } from '../math/Position.ts';
import type { Thing } from '../things/Thing.ts';
import { ThingFlag } from '../things/ThingFlag.ts';
import { CellRect } from './CellRect.ts';
import { CollideFlag, CollideMask } from './CollideFlag.ts';
import type { GameMap } from './GameMap.ts';
import { LineProbe, LineTest } from './LineProbe.ts';
import { LineHitKind, type LineHit } from './MapCell.ts';
import { CREATURE_COLLIDE_PASSES, LINE_STEP_CELLS, PLAYER_COLLIDE_PASSES, PLAYER_MAP_RADIUS_FACTOR } from './tuning.ts';

export interface MovingBody {
  readonly id: number;
  readonly position: Position;
  readonly radius: number;
  delta: Position;
}

export class MapCollide {
  private collided = false;

  constructor(
    private readonly map: GameMap,
    private readonly collisionsActive: boolean,
  ) {}

  get lastCollided(): boolean {
    return this.collided;
  }

  markArea(from: Position, to: Position, flags: number): void {
    this.map.markArea(from.x, from.y, to.x, to.y, flags);
  }

  playerCollide(body: MovingBody): Position {
    const { position } = body;
    if (this.map.collideAt(position.x, position.y) & CollideMask.StaticImpassable) return position;
    let result = position;
    for (let pass = PLAYER_COLLIDE_PASSES; pass > 0; pass--) {
      this.collided = false;
      if (this.collisionsActive) this.pushOutOfThings(body);
      result = this.collideMap(position, body.delta, body.radius * PLAYER_MAP_RADIUS_FACTOR);
      if (!this.collided) break;
    }
    return result;
  }

  creatureCollide(body: MovingBody): Position {
    const { position } = body;
    if (this.map.collideAt(position.x, position.y) & CollideFlag.EdgeOfMap) return position;
    let result = position;
    for (let pass = CREATURE_COLLIDE_PASSES; pass > 0; pass--) {
      this.collided = false;
      this.pushOutOfThings(body);
      result = this.collideMap(position, body.delta, body.radius);
      if (!this.collided) break;
    }
    body.delta.x = result.x - position.x;
    body.delta.y = result.y - position.y;
    return result;
  }

  bounceCollide(body: MovingBody): boolean {
    this.collided = false;
    const { position } = body;
    const step = body.delta.clone();
    const pushed = this.collideMapwhoHeight(position.add(step), body.radius, body.id);
    step.x = pushed.x - position.x;
    step.y = pushed.y - position.y;
    const resolved = this.collideMap(position, step, body.radius);
    if (!this.collided) return false;
    const delta = body.delta;
    const normal = resolved.subtract(position.add(delta)).normalize2D(1);
    const along = 2 * (delta.x * normal.x + delta.y * normal.y);
    delta.x -= normal.x * along;
    delta.y -= normal.y * along;
    return true;
  }

  genericCollide(body: MovingBody): boolean {
    this.collided = false;
    const { position } = body;
    const step = body.delta.clone();
    const pushed = this.collideMapwho(position.add(step), body.radius, body.id);
    step.x = pushed.x - position.x;
    step.y = pushed.y - position.y;
    this.collideMap(position, step, body.radius);
    return this.collided;
  }

  collideMap(position: Position, delta: Position, radius: number): Position {
    if (this.map.collideAt(position.x, position.y) & CollideFlag.EdgeOfMap) return position;
    const target = position.add(delta);
    if (!this.overlapsStatic(target, radius)) return target;
    this.collided = true;
    target.y = position.y;
    if (!this.overlapsStatic(target, radius)) return target;
    target.y = position.y + delta.y;
    target.x = position.x;
    if (!this.overlapsStatic(target, radius)) return target;
    return position;
  }

  overlapsStatic(position: Position, radius: number): boolean {
    return this.map
      .cellsInArea(CellRect.around(position.x, position.y, radius), true)
      .some((cell) => (cell.collide & CollideMask.StaticImpassable) !== 0);
  }

  collideMapwho(position: Position, radius: number, ownerId: number): Position {
    return this.pushOut(position, radius, ownerId, false);
  }

  collideMapwhoHeight(position: Position, radius: number, ownerId: number): Position {
    return this.pushOut(position, radius, ownerId, true);
  }

  collideLine(owner: Thing, from: Position, to: Position, radius: number, affectFlags: number, mapOnly = false): LineHit | undefined {
    const span = to.subtract(from);
    let remaining = span.length / LINE_STEP_CELLS;
    const area = CellRect.around(from.x, from.y, radius);
    const stepX = span.x / remaining;
    const stepY = span.y / remaining;
    const line = new LineProbe(from.x, from.y, to.x, to.y, owner.id, affectFlags, mapOnly ? LineTest.WallsOnly : LineTest.ThingsAndWalls);
    const session = this.map.nextSessionId();
    let hit: LineHit | undefined;
    while (remaining > 0) {
      hit = this.nearestHit(area, line, session);
      if (hit) break;
      remaining -= LINE_STEP_CELLS;
      area.x += stepX;
      area.y += stepY;
    }
    if (!hit) {
      area.x = to.x;
      area.y = to.y;
      return this.nearestHit(area, line, session);
    }
    if (hit.kind === LineHitKind.Thing) pullBackFromThing(hit.poi, from, hit.thing.radius);
    return hit;
  }

  private pushOutOfThings(body: MovingBody): void {
    const pushed = this.collideMapwho(body.position.add(body.delta), body.radius, body.id);
    body.delta.x = pushed.x - body.position.x;
    body.delta.y = pushed.y - body.position.y;
  }

  private pushOut(start: Position, radius: number, ownerId: number, checkHeight: boolean): Position {
    let position = start;
    for (const cell of this.map.cellsInArea(CellRect.around(start.x, start.y, radius))) {
      for (const other of cell.newestFirst()) {
        if (!(other.flags & ThingFlag.Collidable) || ownerId === other.id) continue;
        const distance = other.position.distance2D(position);
        if (distance >= radius + other.radius) continue;
        if (checkHeight && !(position.z < other.position.z + other.height)) continue;
        other.collidedWithId = other.id;
        const away = position.subtract(other.position).scale((radius + other.radius - distance) / distance);
        position = position.add(away);
        this.collided = true;
      }
    }
    return position;
  }

  private nearestHit(area: CellRect, line: LineProbe, session: number): LineHit | undefined {
    let best: LineHit | undefined;
    let bestDistance = Number.MAX_VALUE;
    for (const cell of this.map.cellsInAreaOncePerSession(area, session)) {
      const hit = cell.lineIntersection(line);
      if (!hit) continue;
      const distance = line.distanceFromStartSquared(hit.poi.x, hit.poi.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = hit;
      }
    }
    return best;
  }
}

function pullBackFromThing(poi: { x: number; y: number }, from: Position, radius: number): void {
  const dx = poi.x - from.x;
  const dy = poi.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return;
  const scale = (length - radius) / length;
  poi.x = from.x + dx * scale;
  poi.y = from.y + dy * scale;
}
