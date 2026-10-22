import { describe, expect, it } from 'vitest';
import { CellRect } from '../../../src/domain/map/CellRect.ts';
import { CollideFlag, CollideMask } from '../../../src/domain/map/CollideFlag.ts';
import { Direction } from '../../../src/domain/math/Direction.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { ThingFlag } from '../../../src/domain/things/ThingFlag.ts';
import { FakeThing, at, makeWorld, place, room, solid } from '../support/fakes.ts';

describe('GameMap cells', () => {
  it('rounds the room size to whole cells and marks the border as solid edge of map', () => {
    const { world } = makeWorld({ id: 'X', widthPx: 1311.95, heightPx: 544, initObjects: [] });
    expect(world.map.width).toBe(41);
    expect(world.map.height).toBe(17);
    expect(world.map.cell(0, 5).collide).toBe(CollideMask.MapBorder);
    expect(world.map.cell(40, 5).collide).toBe(CollideMask.MapBorder);
    expect(world.map.cell(5, 16).collide).toBe(CollideMask.MapBorder);
    expect(world.map.cell(5, 5).collide).toBe(CollideFlag.None);
  });

  it('links eight neighbours, east first and clockwise, with a solid invalid cell beyond the map', () => {
    const { world } = makeWorld(room(6, 6));
    const corner = world.map.cell(0, 0);
    expect(corner.adjacent(Direction.East)).toBe(world.map.cell(1, 0));
    expect(corner.adjacent(Direction.SouthEast)).toBe(world.map.cell(1, 1));
    expect(corner.adjacent(Direction.North)).toBe(world.map.invalidCell);
    expect(world.map.invalidCell.collide).toBe(CollideFlag.Solid);
  });

  it('marks collision solids from px rectangles, rounding to cells', () => {
    const { world } = makeWorld(room(10, 10, [solid(3, 3, 2, 1)]));
    expect(world.map.cell(3, 3).collide & CollideFlag.Solid).toBeTruthy();
    expect(world.map.cell(4, 3).collide & CollideFlag.Solid).toBeTruthy();
    expect(world.map.cell(5, 3).collide).toBe(CollideFlag.None);
    expect(world.map.cell(3, 4).collide).toBe(CollideFlag.None);
  });

  it('reports diagonal collide flags as the union of the diagonal and both straight neighbours', () => {
    const { world } = makeWorld(room(10, 10, [solid(5, 4, 1, 1)]));
    const cell = world.map.cell(4, 4);
    expect(cell.collideFlagsToward(Direction.SouthEast) & CollideFlag.Solid).toBeTruthy();
    expect(cell.collideFlagsToward(Direction.South)).toBe(CollideFlag.None);
    expect(cell.collideFlagsToward(Direction.East) & CollideFlag.Solid).toBeTruthy();
  });

  it('finds the first straight neighbour without static collision', () => {
    const { world } = makeWorld(room(10, 10, [solid(5, 4, 1, 1)]));
    expect(world.map.cell(4, 4).validMoveNeighbour()).toBe(world.map.cell(4, 5));
    expect(world.map.cell(0, 0).validMoveNeighbour()).toBeUndefined();
  });

  it('turns towards a clear direction when the preferred one is blocked', () => {
    const { world } = makeWorld(room(10, 10, [solid(5, 4, 1, 1)]));
    expect(world.map.cell(4, 4).clearMoveDirection(Direction.East, Direction.East)).toBe(Direction.North);
  });

  it('collects cells in an area with the inclusive and the minimal rounding', () => {
    const { world } = makeWorld(room(10, 10));
    expect(world.map.cellsInArea(new CellRect(4.2, 4.2, 0.6, 0.6), true)).toHaveLength(1);
    expect(world.map.cellsInArea(new CellRect(4.2, 4.2, 0.6, 0.6))).toHaveLength(9);
  });
});

describe('GameMap draw order', () => {
  it('sorts by screen row and keeps floor things on their cell row', () => {
    const { world } = makeWorld(room(10, 10));
    const lower = place(world, new FakeThing(world, at(3.5, 5.8)));
    const corpse = place(world, new FakeThing(world, at(3.5, 5.9), ThingClass.Zombie), 0.45, ThingFlag.SortFloor);
    const upper = place(world, new FakeThing(world, at(6.5, 5.2)));
    const order = world.map.drawOrder({ x: 0, y: 0, width: 320, height: 320 });
    expect(order).toEqual([corpse, upper, lower]);
  });
});
