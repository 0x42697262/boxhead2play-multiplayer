import { describe, expect, it } from 'vitest';
import { CollideMask } from '../../../src/domain/map/CollideFlag.ts';
import { NavState, NavigationField, NO_DIRECTION, validDirections } from '../../../src/domain/map/NavigationField.ts';
import { Direction } from '../../../src/domain/math/Direction.ts';
import { SequenceRng } from '../../../src/domain/math/Rng.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { cellObject, makeWorld, room, solid } from '../support/fakes.ts';

const FRESH_TICKS = 50;

function worldWithWall() {
  return makeWorld(room(10, 8, [cellObject(InitKind.Player1, 2, 4), solid(5, 1, 1, 5)])).world;
}

function settle(world: ReturnType<typeof worldWithWall>): void {
  for (let i = 0; i < 4; i++) world.update();
}

describe('NavigationField flood fill', () => {
  it('spreads distances in four directions, giving the first ring distance 0 like the original', () => {
    const world = worldWithWall();
    expect(world.map.navigation.state).toBe(NavState.Resume);
    expect(world.map.cell(2, 4).navDist).toBe(0);
    expect(world.map.cell(3, 4).navDist).toBe(0);
    expect(world.map.cell(3, 5).navDist).toBe(1);
  });

  it('routes around solid cells and never enters them', () => {
    const world = worldWithWall();
    settle(world);
    expect(world.map.cell(6, 4).navDist).toBe(7);
    expect(world.map.cell(5, 4).navDist).toBeUndefined();
  });

  it('restarts the fill after it finished', () => {
    const world = worldWithWall();
    settle(world);
    expect([NavState.Finished, NavState.Resume]).toContain(world.map.navigation.state);
    const before = world.map.cell(2, 4).navId;
    settle(world);
    expect(world.map.cell(2, 4).navId).toBeGreaterThan(before);
  });
});

describe('NavigationField.direction', () => {
  it('steps to the closest valid neighbour when the straight line is blocked', () => {
    const world = worldWithWall();
    settle(world);
    const nav = world.map.navigation;
    expect(nav.direction(world.map.cell(6, 4), Direction.West, Direction.West, CollideMask.NonMovable, true)).toBe(Direction.South);
  });

  it('keeps the target direction when that neighbour is closer and clear', () => {
    const world = worldWithWall();
    settle(world);
    expect(world.map.navigation.direction(world.map.cell(4, 4), Direction.East, Direction.West, CollideMask.NonMovable, true)).toBe(
      Direction.West,
    );
  });

  it('gives up when every direction is blocked', () => {
    const world = makeWorld(room(10, 8, [cellObject(InitKind.Player1, 2, 2), solid(4, 3, 3, 1), solid(4, 5, 3, 1), solid(4, 4, 1, 1), solid(6, 4, 1, 1)]))
      .world;
    settle(world);
    const boxed = world.map.cell(5, 4);
    expect(validDirections(boxed, CollideMask.NonMovable)).toBe(0);
    boxed.navId = world.map.navigation.updates;
    boxed.navDist = 3;
    expect(world.map.navigation.direction(boxed, Direction.East, Direction.East, CollideMask.NonMovable, true)).toBe(NO_DIRECTION);
  });

  it('falls back to direct steering on cells the fill has not reached recently', () => {
    const world = makeWorld(room(10, 8, [solid(5, 4, 1, 1)])).world;
    const left = new NavigationField(new SequenceRng([0]), () => FRESH_TICKS);
    const right = new NavigationField(new SequenceRng([0.9]), () => FRESH_TICKS);
    const cell = world.map.cell(4, 4);
    expect(left.direction(cell, Direction.East, Direction.East, CollideMask.NonMovable, false)).toBe(Direction.North);
    expect(right.direction(cell, Direction.East, Direction.East, CollideMask.NonMovable, false)).toBe(Direction.South);
  });
});
