import { describe, expect, it } from 'vitest';
import { FakeThing, at, makeWorld, room } from '../support/fakes.ts';

describe('Mapwho', () => {
  it('files a thing under the cell its position truncates to', () => {
    const { world } = makeWorld(room(10, 10));
    const thing = new FakeThing(world, at(3.9, 2.1));
    world.map.mapwho.addThing(thing);
    expect(thing.cellId).toEqual({ x: 3, y: 2 });
    expect(world.map.cell(3, 2).things).toContain(thing);
  });

  it('moves a thing between cells only when its cell changes', () => {
    const { world } = makeWorld(room(10, 10));
    const thing = new FakeThing(world, at(3.5, 2.5));
    world.map.mapwho.addThing(thing);
    thing.position.x = 3.9;
    expect(world.map.mapwho.moveThing(thing)).toBe(false);
    thing.position.x = 4.1;
    expect(world.map.mapwho.moveThing(thing)).toBe(true);
    expect(world.map.cell(3, 2).childCount).toBe(0);
    expect(world.map.cell(4, 2).things).toEqual([thing]);
  });

  it('removes a thing and forgets its cell', () => {
    const { world } = makeWorld(room(10, 10));
    const thing = new FakeThing(world, at(3.5, 2.5));
    world.map.mapwho.addThing(thing);
    world.map.mapwho.deleteThing(thing);
    expect(thing.cellId).toBeUndefined();
    expect(world.map.cell(3, 2).childCount).toBe(0);
  });

  it('lists cell occupants newest first, like AS2 for..in', () => {
    const { world } = makeWorld(room(10, 10));
    const first = new FakeThing(world, at(3.5, 2.5));
    const second = new FakeThing(world, at(3.6, 2.6));
    world.map.mapwho.addThing(first);
    world.map.mapwho.addThing(second);
    expect(world.map.cell(3, 2).newestFirst()).toEqual([second, first]);
  });
});
