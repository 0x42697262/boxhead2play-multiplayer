import { ALL_DIRECTIONS, directionDeltaX, directionDeltaY } from '../math/Direction.ts';
import type { Rng } from '../math/Rng.ts';
import type { AnimationCatalog } from '../animation/AnimationCatalog.ts';
import type { EventSink } from '../events.ts';
import type { Thing } from '../things/Thing.ts';
import { ThingFlag } from '../things/ThingFlag.ts';
import type { CellBounds, CellRect } from './CellRect.ts';
import { CollideFlag, CollideMask } from './CollideFlag.ts';
import { MapAffect } from './MapAffect.ts';
import { MapCell } from './MapCell.ts';
import { MapCollide } from './MapCollide.ts';
import { MapDecals } from './MapDecals.ts';
import { Mapwho } from './Mapwho.ts';
import { NavigationField } from './NavigationField.ts';
import { CELL_SIZE_PX } from './tuning.ts';

export interface MapOptions {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly collisionsActive: boolean;
  readonly rng: Rng;
  readonly events: EventSink;
  readonly animations: AnimationCatalog;
  readonly navFreshnessTicks: () => number;
}

export interface PixelArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const DRAW_CELL_MARGIN = 0.5;
const DRAW_EXTRA_ROWS = 1;

export class GameMap {
  readonly width: number;
  readonly height: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly invalidCell: MapCell;
  readonly mapwho: Mapwho;
  readonly collide: MapCollide;
  readonly affects: MapAffect;
  readonly decals: MapDecals;
  readonly navigation: NavigationField;
  private readonly rows: MapCell[][];
  private sessionId = 0;

  constructor(options: MapOptions) {
    this.widthPx = options.widthPx;
    this.heightPx = options.heightPx;
    this.width = Math.round(options.widthPx / CELL_SIZE_PX);
    this.height = Math.round(options.heightPx / CELL_SIZE_PX);
    this.rows = [];
    for (let y = 0; y < this.height; y++) {
      const row: MapCell[] = [];
      for (let x = 0; x < this.width; x++) row.push(new MapCell(x, y));
      this.rows.push(row);
    }
    this.markBorder();
    this.invalidCell = new MapCell(-1, -1);
    this.invalidCell.collide = CollideFlag.Solid;
    this.linkAdjacents();
    this.mapwho = new Mapwho(this);
    this.collide = new MapCollide(this, options.collisionsActive);
    this.affects = new MapAffect(this);
    this.decals = new MapDecals(options.rng, options.events, options.animations);
    this.navigation = new NavigationField(options.rng, options.navFreshnessTicks);
  }

  cellAt(x: number, y: number): MapCell | undefined {
    return this.rows[Math.trunc(y)]?.[Math.trunc(x)];
  }

  collideAt(x: number, y: number): number {
    return this.cellAt(x, y)?.collide ?? CollideFlag.None;
  }

  cell(x: number, y: number): MapCell {
    const found = this.cellAt(x, y);
    if (!found) throw new Error(`No map cell at (${x}, ${y})`);
    return found;
  }

  allCells(): MapCell[] {
    return this.rows.flat();
  }

  cellBounds(area: CellRect): CellBounds {
    return {
      left: Math.max(0, Math.round(area.left) - 1),
      top: Math.max(0, Math.round(area.top) - 1),
      right: Math.min(this.width - 1, Math.round(area.right)),
      bottom: Math.min(this.height - 1, Math.round(area.bottom)),
    };
  }

  cellBoundsMin(area: CellRect): CellBounds {
    return {
      left: Math.max(0, Math.floor(area.left)),
      top: Math.max(0, Math.floor(area.top)),
      right: Math.min(this.width - 1, Math.floor(area.right)),
      bottom: Math.min(this.height - 1, Math.floor(area.bottom)),
    };
  }

  cellsInArea(area: CellRect, minArea = false): MapCell[] {
    if (Number.isNaN(area.x)) return [];
    return this.collectCells(minArea ? this.cellBoundsMin(area) : this.cellBounds(area), undefined);
  }

  cellsInAreaOncePerSession(area: CellRect, sessionId: number): MapCell[] {
    if (Number.isNaN(area.x)) return [];
    return this.collectCells(this.cellBounds(area), sessionId);
  }

  nextSessionId(): number {
    this.sessionId++;
    return this.sessionId;
  }

  markArea(left: number, top: number, right: number, bottom: number, flags: number): void {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const cell = this.rows[y]?.[x];
        if (cell) cell.collide |= flags;
      }
    }
  }

  drawOrder(area: PixelArea): Thing[] {
    const left = Math.floor(area.x / CELL_SIZE_PX - DRAW_CELL_MARGIN);
    const top = Math.floor(area.y / CELL_SIZE_PX - DRAW_CELL_MARGIN);
    const right = Math.ceil((area.x + area.width) / CELL_SIZE_PX + DRAW_CELL_MARGIN);
    const bottom = Math.ceil((area.y + area.height) / CELL_SIZE_PX + DRAW_CELL_MARGIN) + DRAW_EXTRA_ROWS;
    const buckets = new Map<number, Thing[]>();
    for (let y = top; y < bottom; y++) {
      const row = this.rows[y];
      if (!row) continue;
      for (let x = left; x < right; x++) {
        const cell = row[x];
        if (!cell || cell.childCount === 0) continue;
        for (const thing of cell.newestFirst()) {
          const key = drawSortKey(thing);
          const bucket = buckets.get(key);
          if (bucket) bucket.push(thing);
          else buckets.set(key, [thing]);
        }
      }
    }
    const ordered: Thing[] = [];
    const lastRow = bottom * CELL_SIZE_PX;
    for (let row = top * CELL_SIZE_PX; row <= lastRow; row++) {
      const bucket = buckets.get(row);
      if (!bucket) continue;
      for (const thing of bucket.slice().reverse()) {
        thing.flags |= ThingFlag.Drawn;
        ordered.push(thing);
      }
    }
    return ordered;
  }

  private collectCells(bounds: CellBounds, sessionId: number | undefined): MapCell[] {
    const cells: MapCell[] = [];
    for (let y = bounds.top; y <= bounds.bottom; y++) {
      const row = this.rows[y];
      if (!row) continue;
      for (let x = bounds.left; x <= bounds.right; x++) {
        const cell = row[x];
        if (!cell) continue;
        if (sessionId !== undefined) {
          if (cell.sessionCheck === sessionId) continue;
          cell.sessionCheck = sessionId;
        }
        cells.push(cell);
      }
    }
    return cells.reverse();
  }

  private markBorder(): void {
    const border = CollideMask.MapBorder;
    const first = this.rows[0];
    const last = this.rows[this.height - 1];
    for (let x = 0; x < this.width; x++) {
      const topCell = first?.[x];
      const bottomCell = last?.[x];
      if (topCell) topCell.collide = border;
      if (bottomCell) bottomCell.collide = border;
    }
    for (const row of this.rows) {
      const leftCell = row[0];
      const rightCell = row[this.width - 1];
      if (leftCell) leftCell.collide = border;
      if (rightCell) rightCell.collide = border;
    }
  }

  private linkAdjacents(): void {
    for (const row of this.rows) {
      for (const cell of row) {
        cell.setAdjacents(
          ALL_DIRECTIONS.map(
            (d) => this.rows[cell.y + directionDeltaY(d)]?.[cell.x + directionDeltaX(d)] ?? this.invalidCell,
          ),
        );
      }
    }
    this.invalidCell.setAdjacents(ALL_DIRECTIONS.map(() => this.invalidCell));
  }
}

function drawSortKey(thing: Thing): number {
  const y = thing.flags & ThingFlag.SortFloor ? Math.trunc(thing.position.y) : thing.position.y;
  return Math.trunc(y * CELL_SIZE_PX);
}
