import { describe, expect, it } from 'vitest';
import { LineHitKind } from '../../../src/domain/map/MapCell.ts';
import type { Position } from '../../../src/domain/math/Position.ts';
import { AffectType } from '../../../src/domain/things/affects/AffectType.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { ThingFlag } from '../../../src/domain/things/ThingFlag.ts';
import { FakeThing, at, makeWorld, place, room, solid } from '../support/fakes.ts';

function body(position: Position, delta: Position, radius = 0.45, id = 999) {
  return { id, position, radius, delta };
}

describe('MapCollide.collideMap', () => {
  it('moves freely when nothing static is in the way', () => {
    const { world } = makeWorld(room(10, 10));
    const result = world.map.collide.collideMap(at(4.5, 4.5), at(0.1, 0.1), 0.45);
    expect(result.x).toBeCloseTo(4.6);
    expect(result.y).toBeCloseTo(4.6);
    expect(world.map.collide.lastCollided).toBe(false);
  });

  it('slides along a wall by dropping the blocked axis', () => {
    const { world } = makeWorld(room(10, 10, [solid(5, 0, 1, 10)]));
    const result = world.map.collide.collideMap(at(4.5, 4.5), at(0.2, 0.1), 0.45);
    expect(result.x).toBeCloseTo(4.5);
    expect(result.y).toBeCloseTo(4.6);
    expect(world.map.collide.lastCollided).toBe(true);
  });

  it('stays put on the edge of the map', () => {
    const { world } = makeWorld(room(10, 10));
    const start = at(0.5, 4.5);
    expect(world.map.collide.collideMap(start, at(1, 0), 0.45)).toBe(start);
  });
});

describe('MapCollide body collision', () => {
  it('pushes a player out of a collidable thing and records the collision', () => {
    const { world } = makeWorld(room(10, 10));
    const blocker = place(world, new FakeThing(world, at(5.5, 4.5)), 0.45, ThingFlag.Collidable);
    const mover = body(at(4.5, 4.5), at(0.3, 0));
    const result = world.map.collide.playerCollide(mover);
    expect(result.distance2D(blocker.position)).toBeGreaterThanOrEqual(0.9 - 1e-9);
    expect(blocker.collidedWithId).toBe(blocker.id);
  });

  it('lets players walk through things when collisions are switched off', () => {
    const { world } = makeWorld(room(10, 10), { options: { collisionsActive: false } });
    place(world, new FakeThing(world, at(5.0, 4.5)), 0.45, ThingFlag.Collidable);
    const result = world.map.collide.playerCollide(body(at(4.5, 4.5), at(0.3, 0)));
    expect(result.x).toBeCloseTo(4.8);
  });

  it('ignores things that are not collidable and the mover itself', () => {
    const { world } = makeWorld(room(10, 10));
    const self = place(world, new FakeThing(world, at(4.5, 4.5)), 0.45, ThingFlag.Collidable);
    place(world, new FakeThing(world, at(5.0, 4.5)), 0.45);
    const result = world.map.collide.creatureCollide(body(at(4.5, 4.5), at(0.2, 0), 0.45, self.id));
    expect(result.x).toBeCloseTo(4.7);
  });

  it('rewrites the creature delta to the resolved step', () => {
    const { world } = makeWorld(room(10, 10, [solid(5, 0, 1, 10)]));
    const mover = body(at(4.5, 4.5), at(0.3, 0));
    world.map.collide.creatureCollide(mover);
    expect(mover.delta.x).toBeCloseTo(0);
  });

  it('bounces a moving body off a wall by reflecting its delta', () => {
    const { world } = makeWorld(room(10, 10, [solid(5, 0, 1, 10)]));
    const mover = body(at(4.5, 4.5), at(0.2, 0), 0.4);
    expect(world.map.collide.bounceCollide(mover)).toBe(true);
    expect(mover.delta.x).toBeLessThan(0);
  });
});

describe('MapCollide.collideLine', () => {
  it('stops a line at the near face of a solid cell', () => {
    const { world } = makeWorld(room(12, 10, [solid(6, 0, 1, 10)]));
    const shooter = new FakeThing(world, at(2.5, 4.5));
    const hit = world.map.collide.collideLine(shooter, at(2.5, 4.5), at(9.5, 4.5), 0.04, AffectType.Bullet);
    expect(hit?.kind).toBe(LineHitKind.Wall);
    expect(hit?.poi.x).toBeCloseTo(6);
    expect(hit?.poi.y).toBeCloseTo(4.5);
  });

  it('hits the first thing that accepts the affect and pulls the point back by its radius', () => {
    const { world } = makeWorld(room(12, 10));
    const shooter = new FakeThing(world, at(2.5, 4.5));
    const target = place(world, new FakeThing(world, at(6.5, 4.5), ThingClass.Zombie));
    target.affectSetup(AffectType.Bullet);
    const hit = world.map.collide.collideLine(shooter, at(2.5, 4.5), at(9.5, 4.5), 0.04, AffectType.Bullet);
    expect(hit?.kind).toBe(LineHitKind.Thing);
    expect(hit?.kind === LineHitKind.Thing && hit.thing).toBe(target);
    expect(hit?.poi.x).toBeCloseTo(6.05);
  });

  it('blocks line of fire with a wall in front of the target', () => {
    const { world } = makeWorld(room(12, 10, [solid(5, 0, 1, 10)]));
    const devil = new FakeThing(world, at(2.5, 4.5), ThingClass.Devil);
    const player = place(world, new FakeThing(world, at(7.5, 4.5), ThingClass.Player));
    player.affectSetup(AffectType.PlayerLineOfSight);
    const hit = world.map.collide.collideLine(devil, at(2.5, 4.5), player.position, 0.2, AffectType.PlayerLineOfSight);
    expect(hit?.kind).toBe(LineHitKind.Wall);
  });

  it('ignores things when testing against the map only', () => {
    const { world } = makeWorld(room(12, 10));
    const shooter = new FakeThing(world, at(2.5, 4.5));
    const target = place(world, new FakeThing(world, at(6.5, 4.5)));
    target.affectSetup(AffectType.Bullet);
    expect(world.map.collide.collideLine(shooter, at(2.5, 4.5), at(9.5, 4.5), 0.04, AffectType.Bullet, true)).toBeUndefined();
  });
});
