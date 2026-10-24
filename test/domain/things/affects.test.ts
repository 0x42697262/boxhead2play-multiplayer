import { describe, expect, it } from 'vitest';
import { CellRect } from '../../../src/domain/map/CellRect.ts';
import { Angle } from '../../../src/domain/math/Angle.ts';
import { Affect } from '../../../src/domain/things/affects/Affect.ts';
import { AffectType } from '../../../src/domain/things/affects/AffectType.ts';
import { BulletAffect } from '../../../src/domain/things/affects/BulletAffect.ts';
import { ExplosionAffect, explosionDamage } from '../../../src/domain/things/affects/ExplosionAffect.ts';
import { FireBallAffect } from '../../../src/domain/things/affects/FireBallAffect.ts';
import { affectorsInProcessingOrder, HitState, resolveHit } from '../../../src/domain/things/affects/hitReaction.ts';
import { ZombieAttackAffect } from '../../../src/domain/things/affects/ZombieAttackAffect.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { Direction } from '../../../src/domain/math/Direction.ts';
import { FakeThing, at, makeWorld, place, room, cellOf } from '../support/fakes.ts';

describe('affect damage', () => {
  it('subtracts the flat damage for bullets, fireballs and zombie attacks', () => {
    const { world } = makeWorld(room(10, 10));
    const target = new FakeThing(world, at(4.5, 4.5));
    const source = new FakeThing(world, at(3.5, 4.5));
    expect(new BulletAffect(undefined, source, 26, new Angle(0)).affectThing(target)).toBe(26);
    expect(new FireBallAffect(undefined, source, 10, new Angle(0)).affectThing(target)).toBe(10);
    expect(new ZombieAttackAffect(source, 50).affectThing(target)).toBe(50);
    expect(target.life).toBe(100 - 26 - 10 - 50);
  });

  it('scales explosion damage by distance: full, 75% and 50% bands, nothing outside the range', () => {
    expect(explosionDamage(100, 0.5)).toBe(100);
    expect(explosionDamage(100, 0.6)).toBe(75);
    expect(explosionDamage(100, 0.9)).toBe(50);
    const { world } = makeWorld(room(10, 10));
    const blast = new FakeThing(world, at(4.5, 4.5));
    const far = new FakeThing(world, at(7.5, 4.5));
    expect(new ExplosionAffect(undefined, blast, 100, 2).affectThing(far)).toBe(0);
    expect(far.life).toBe(100);
  });
});

describe('MapAffect', () => {
  it('affects only things whose flags accept the type and never the affector itself', () => {
    const { world } = makeWorld(room(10, 10));
    const blast = place(world, new FakeThing(world, at(4.5, 4.5)));
    blast.affectSetup(AffectType.Explosion);
    const zombie = place(world, new FakeThing(world, at(5.5, 4.5), ThingClass.Zombie));
    zombie.affectSetup(AffectType.Explosion);
    const deaf = place(world, new FakeThing(world, at(4.5, 5.5)));
    deaf.affectSetup(AffectType.Bullet);
    world.map.affects.affectArea(CellRect.around(4.5, 4.5, 2), new ExplosionAffect(undefined, blast, 100, 2));
    expect(zombie.affectors).toHaveLength(1);
    expect(deaf.affectors).toHaveLength(0);
    expect(blast.affectors).toHaveLength(0);
  });

  it('affects every accepting thing along a line', () => {
    const { world } = makeWorld(room(12, 10));
    const shooter = new FakeThing(world, at(1.5, 4.5));
    const near = place(world, new FakeThing(world, at(4.5, 4.5)));
    const far = place(world, new FakeThing(world, at(8.5, 4.5)));
    const off = place(world, new FakeThing(world, at(8.5, 6.5)));
    for (const thing of [near, far, off]) thing.affectSetup(AffectType.Bullet);
    const count = world.map.affects.affectLine(shooter, at(1.5, 4.5), at(10.5, 4.5), 0.1, new BulletAffect(undefined, shooter, 50, new Angle(0)));
    expect(count).toBe(2);
    expect(near.affectors).toHaveLength(1);
    expect(far.affectors).toHaveLength(1);
    expect(off.affectors).toHaveLength(0);
  });

  it('delivers a zombie attack to the adjacent cell', () => {
    const { world } = makeWorld(room(10, 10));
    const zombie = new FakeThing(world, at(4.5, 4.5), ThingClass.Zombie);
    const player = place(world, new FakeThing(world, at(5.5, 4.5), ThingClass.Player));
    player.affectSetup(AffectType.ZombieAttack);
    cellOf(world, 4, 4).adjacent(Direction.East).affect(new ZombieAttackAffect(zombie, 50));
    expect(player.affectors[0]?.type).toBe(AffectType.ZombieAttack);
  });
});

describe('hit reactions', () => {
  const target = (isPlayer = false) => ({ life: 100, position: at(5.5, 4.5), mass: 1, isPlayer });

  it('knocks a creature away from a bullet with count round(damage / 5 * 2)', () => {
    const { world } = makeWorld(room(10, 10));
    const bullet = new FakeThing(world, at(3.5, 4.5));
    const reaction = resolveHit(new BulletAffect(undefined, bullet, 26, new Angle(0)), target(), true);
    expect(reaction?.state).toBe(HitState.BulletHit);
    expect(reaction?.stateCount).toBe(10);
    expect(reaction?.delta.x).toBeCloseTo(0.325);
    expect(reaction?.facingRadians).toBeCloseTo(Math.PI);
  });

  it('caps explosion knockback at 0.3 cells', () => {
    const { world } = makeWorld(room(10, 10));
    const blast = new FakeThing(world, at(4.5, 4.5));
    const reaction = resolveHit(new ExplosionAffect(undefined, blast, 500, 4), target(), true);
    expect(reaction?.state).toBe(HitState.ExplosionHit);
    expect(reaction?.delta.length).toBeCloseTo(0.3);
    expect(reaction?.stateCount).toBeUndefined();
  });

  it('spares players from bullets and explosions when damage is off, but not from fireballs or zombies', () => {
    const { world } = makeWorld(room(10, 10));
    const source = new FakeThing(world, at(4.5, 4.5));
    expect(resolveHit(new BulletAffect(undefined, source, 26, new Angle(0)), target(true), false)).toBeUndefined();
    expect(resolveHit(new ExplosionAffect(undefined, source, 100, 2), target(true), false)).toBeUndefined();
    expect(resolveHit(new FireBallAffect(undefined, source, 10, new Angle(0)), target(true), false)?.state).toBe(HitState.BulletHit);
    expect(resolveHit(new ZombieAttackAffect(source, 50), target(true), false)?.stateCount).toBe(10);
  });

  it('ignores pushes and processes affectors newest first', () => {
    const { world } = makeWorld(room(10, 10));
    const source = new FakeThing(world, at(4.5, 4.5));
    const push = new Affect(AffectType.Push, undefined, source, 10);
    expect(resolveHit(push, target(), true)).toBeUndefined();
    const second = new ZombieAttackAffect(source, 1);
    expect(affectorsInProcessingOrder([push, second])).toEqual([second, push]);
  });
});
