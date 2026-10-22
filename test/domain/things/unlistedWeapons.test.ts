import { describe, expect, it } from 'vitest';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { createWeapon } from '../../../src/domain/things/weapons/createWeapon.ts';
import { UnlistedWeapon } from '../../../src/domain/things/weapons/WeaponId.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { cellObject, room } from '../support/fakes.ts';
import { makeRealWorld, ofClass, playerOf, run } from '../support/realWorld.ts';
import { LatchedControl } from '../../../src/domain/things/creatures/PlayerControls.ts';
import { IDLE_CONTROL } from '../../../src/domain/world/input.ts';

describe('weapons outside the player list', () => {
  it('devastator: a shot that leaves lines of explosions to both sides from its fifth tick', () => {
    const world = makeRealWorld(room(30, 20, [cellObject(InitKind.Player1, 3, 10)]));
    const devastator = createWeapon(UnlistedWeapon.Devastator, playerOf(world));
    const trigger = new LatchedControl();
    trigger.sync({ ...IDLE_CONTROL, down: true }, world.tick);
    devastator.update(trigger);
    expect(ofClass(world, ThingClass.ShotDevastator)).toHaveLength(1);
    run(world, 4);
    expect(ofClass(world, ThingClass.EffectExplosion)).toHaveLength(0);
    run(world, 1);
    expect(ofClass(world, ThingClass.EffectExplosion)).toHaveLength(16);
  });

  it('smart bomb: places an effect that removes itself', () => {
    const world = makeRealWorld(room(10, 10, [cellObject(InitKind.Player1, 3, 3)]));
    const smartBomb = createWeapon(UnlistedWeapon.SmartBomb, playerOf(world));
    const trigger = new LatchedControl();
    trigger.sync({ ...IDLE_CONTROL, down: true }, world.tick);
    smartBomb.update(trigger);
    expect(smartBomb.ammo).toBe(19);
    expect(ofClass(world, ThingClass.EffectSmartBomb)).toHaveLength(1);
    run(world, 2);
    expect(ofClass(world, ThingClass.EffectSmartBomb)).toHaveLength(0);
  });
});
