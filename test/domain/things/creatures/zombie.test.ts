import { describe, expect, it } from 'vitest';
import { DomainEventType } from '../../../../src/domain/events.ts';
import { Angle } from '../../../../src/domain/math/Angle.ts';
import { CollideFlag } from '../../../../src/domain/map/CollideFlag.ts';
import { BulletAffect } from '../../../../src/domain/things/affects/BulletAffect.ts';
import { CreatureState } from '../../../../src/domain/things/creatures/CreatureState.ts';
import { Zombie } from '../../../../src/domain/things/creatures/Zombie.ts';
import { ThingClass } from '../../../../src/domain/things/ThingClass.ts';
import { ThingFlag } from '../../../../src/domain/things/ThingFlag.ts';
import { VisualKind } from '../../../../src/domain/visuals.ts';
import { InitKind } from '../../../../src/domain/world/RoomDefinition.ts';
import { at, cellObject, room } from '../../support/fakes.ts';
import { makeRealWorld, ofClass, playerOf, run, spawn } from '../../support/realWorld.ts';

const corridor = () => room(16, 7, [cellObject(InitKind.Player1, 2, 3)]);

describe('Zombie', () => {
  it('reserves its cell, enters the map and walks cell to cell toward the closest player', () => {
    const world = makeRealWorld(corridor());
    const zombie = spawn(world, new Zombie(world, at(12.2, 3.7)));
    run(world, 1);
    expect(zombie.position).toEqual(at(12.5, 3.5));
    expect(zombie.state).toBe(CreatureState.EnterMap);
    expect(world.map.cell(12, 3).collide & CollideFlag.Creature).toBeTruthy();
    expect(zombie.speed).toBeCloseTo(0.022);
    run(world, 1);
    expect(zombie.state).toBe(CreatureState.CellToCell);
    expect(zombie.hasFlag(ThingFlag.Collidable)).toBe(true);
    run(world, 300);
    expect(zombie.position.x).toBeLessThan(10);
    expect(Math.abs(zombie.position.y - 3.5)).toBeLessThan(1);
  });

  it('attacks the player in the next cell with 50 damage', () => {
    const world = makeRealWorld(corridor());
    const player = playerOf(world);
    spawn(world, new Zombie(world, at(5.5, 3.5)));
    let lowest = player.life;
    for (let tick = 0; tick < 600; tick++) {
      player.invincible = 0;
      world.update();
      lowest = Math.min(lowest, player.life);
    }
    expect(lowest).toBeLessThanOrEqual(150 + 1);
    expect(player.hitAngle).toBeDefined();
  });

  it('reacts to a bullet, bleeds, dies, scores and fades out', () => {
    const world = makeRealWorld(corridor());
    const zombie = spawn(world, new Zombie(world, at(8.5, 3.5)));
    run(world, 2);
    world.events.drain();
    zombie.affect(new BulletAffect(undefined, playerOf(world), 100, new Angle(0)));
    run(world, 1);
    expect(zombie.life).toBe(0);
    expect(zombie.hasFlag(ThingFlag.Dead)).toBe(true);
    const events = world.events.drain();
    expect(events.some((event) => event.type === DomainEventType.DecalRequested)).toBe(true);
    expect(events.some((event) => event.type === DomainEventType.SoundRequested)).toBe(true);
    run(world, 30);
    expect(zombie.state).toBe(CreatureState.Dead);
    expect(world.hud.totalScore).toBe(100 * 2);
    expect(zombie.visual()?.kind).toBe(VisualKind.Character);
    run(world, 60);
    expect(ofClass(world, ThingClass.Zombie)).toHaveLength(0);
  });

  it('draws as the zombie style with the XSI set of its animation', () => {
    const world = makeRealWorld(corridor());
    const zombie = spawn(world, new Zombie(world, at(8.5, 3.5)));
    run(world, 2);
    const visual = zombie.visual();
    if (visual?.kind !== VisualKind.Character) throw new Error('expected a character visual');
    expect(visual.style).toBe('zombie');
    expect(visual.animation).toBe('Zombie_Zombie_Walk');
    expect(visual.styleScale).toBe(0.35);
  });
});
