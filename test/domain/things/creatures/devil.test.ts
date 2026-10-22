import { describe, expect, it } from 'vitest';
import { CreatureState } from '../../../../src/domain/things/creatures/CreatureState.ts';
import { Devil } from '../../../../src/domain/things/creatures/Devil.ts';
import { FireBall } from '../../../../src/domain/things/shots/FireBall.ts';
import { ThingClass } from '../../../../src/domain/things/ThingClass.ts';
import { VisualKind } from '../../../../src/domain/visuals.ts';
import { InitKind } from '../../../../src/domain/world/RoomDefinition.ts';
import { at, cellObject, room } from '../../support/fakes.ts';
import { makeRealWorld, ofClass, playerOf, spawn } from '../../support/realWorld.ts';

describe('Devil', () => {
  it('turns to a player in range and line of sight and throws a fireball that hurts even with damage off', () => {
    const world = makeRealWorld(room(16, 7, [cellObject(InitKind.Player1, 2, 3)]), { options: { damageActive: false } });
    const player = playerOf(world);
    const devil = spawn(world, new Devil(world, at(6.5, 3.5)));
    let fireballs = 0;
    let lowest = player.life;
    for (let tick = 0; tick < 200; tick++) {
      player.invincible = 0;
      world.update();
      fireballs = Math.max(fireballs, ofClass(world, ThingClass.ShotFireBall).length);
      lowest = Math.min(lowest, player.life);
    }
    expect(devil.radius).toBe(0.42);
    expect(devil.maxLife).toBe(1000);
    expect(fireballs).toBeGreaterThan(0);
    expect(lowest).toBeLessThanOrEqual(150 + 1);
  });

  it('throws an object-breaking fireball at a wall in its way', () => {
    const world = makeRealWorld(room(16, 7, [cellObject(InitKind.Player1, 1, 3), cellObject(InitKind.Wall, 7, 3, 1)]));
    const devil = spawn(world, new Devil(world, at(10.5, 3.5)));
    const thrown: FireBall[] = [];
    for (let tick = 0; tick < 300 && ofClass(world, ThingClass.Wall).length > 0; tick++) {
      world.update();
      for (const thing of ofClass(world, ThingClass.ShotFireBall)) if (thing instanceof FireBall && !thrown.includes(thing)) thrown.push(thing);
    }
    expect(thrown.some((fireball) => fireball.attacksObject)).toBe(true);
    expect(ofClass(world, ThingClass.Wall)).toHaveLength(0);
    expect(devil.state).not.toBe(CreatureState.None);
  });

  it('draws with the devil style sheet scale', () => {
    const world = makeRealWorld(room(16, 7, [cellObject(InitKind.Player1, 2, 3)]));
    const devil = spawn(world, new Devil(world, at(8.5, 3.5)));
    world.update();
    world.update();
    const visual = devil.visual();
    if (visual?.kind !== VisualKind.Character) throw new Error('expected a character visual');
    expect(visual.style).toBe('devil');
    expect(visual.styleScale).toBe(0.42);
  });
});
