import { describe, expect, it } from 'vitest';
import { DomainEventType } from '../../../src/domain/events.ts';
import { Angle } from '../../../src/domain/math/Angle.ts';
import { SequenceRng } from '../../../src/domain/math/Rng.ts';
import { ClipSymbol } from '../../../src/domain/things/clipVisual.ts';
import { Explosion, explosionRange } from '../../../src/domain/things/effects/Explosion.ts';
import { MuzzleFlash } from '../../../src/domain/things/effects/MuzzleFlash.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { ClipMode, VisualKind } from '../../../src/domain/visuals.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { syntheticAnimationCatalog } from '../support/animationCatalog.ts';
import { at, cellObject, room, cellOf } from '../support/fakes.ts';
import { makeRealWorld, ofClass, run, spawn } from '../support/realWorld.ts';

const open = () => room(20, 14, [cellObject(InitKind.Player1, 1, 1)]);

describe('Explosion', () => {
  it('grows its range by 0.005 cells per damage point above 100', () => {
    expect(explosionRange(100)).toBe(2);
    expect(explosionRange(50)).toBe(2);
    expect(explosionRange(250)).toBeCloseTo(2.75);
  });

  it('shakes, flashes, scorches and plays its sound, then animates for frameCount / 2.5 ticks', () => {
    const world = makeRealWorld(open(), { animations: syntheticAnimationCatalog({ clipFrames: { [ClipSymbol.Explosion]: 18 } }) });
    world.events.drain();
    const explosion = spawn(world, new Explosion(world, at(10.5, 7.5), new Angle(0), undefined, 100));
    run(world, 1);
    const types = world.events.drain().map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining([DomainEventType.CameraShaken, DomainEventType.BrightnessFlashed, DomainEventType.DecalRequested, DomainEventType.SoundRequested]));
    const visual = explosion.visual();
    expect(visual).toMatchObject({ kind: VisualKind.Clip, mode: ClipMode.Animation, symbol: 'Effect.Explosion', frame: 2 });
    run(world, 6);
    expect(explosion.isProcessing).toBe(true);
    run(world, 1);
    expect(explosion.isProcessing).toBe(false);
  });

  it('throws four cluster shells that explode on their own', () => {
    const world = makeRealWorld(open());
    const explosion = spawn(world, new Explosion(world, at(10.5, 7.5), new Angle(0), undefined, 150));
    explosion.clusterExplode = 1;
    run(world, 1);
    expect(ofClass(world, ThingClass.ShotClusterShell)).toHaveLength(4);
    run(world, 30);
    expect(ofClass(world, ThingClass.ShotClusterShell)).toHaveLength(0);
  });

  it('adds delayed fragment explosions around itself with bigger bang', () => {
    const world = makeRealWorld(open(), { rng: new SequenceRng([0]) });
    const explosion = spawn(world, new Explosion(world, at(10.5, 7.5), new Angle(0), undefined, 150));
    explosion.biggerBang = 2;
    run(world, 1);
    const fragments = ofClass(world, ThingClass.EffectExplosion).filter((thing) => thing !== explosion) as Explosion[];
    expect(fragments).toHaveLength(3);
    expect(fragments.map((fragment) => fragment.delay)).toEqual([2, 2, 2]);
    expect(fragments.every((fragment) => !fragment.detonated)).toBe(true);
    run(world, 3);
    expect(fragments.every((fragment) => fragment.detonated)).toBe(true);
  });
});

describe('MuzzleFlash', () => {
  it('is an omni-directional clip drawn for exactly one tick', () => {
    const world = makeRealWorld(open());
    const flash = spawn(world, new MuzzleFlash(world, at(5.5, 5.5, 0.5), new Angle(1), ClipSymbol.PistolMuzzleFlash));
    run(world, 1);
    expect(cellOf(world, 5, 5).things).toContain(flash);
    const visual = flash.visual();
    expect(visual).toMatchObject({ mode: ClipMode.OmniDirectional, symbol: 'Pistol.MuzzleFlash', rotationCount: 8 });
    expect(visual.angleRadians).toBeCloseTo(1);
    run(world, 1);
    expect(cellOf(world, 5, 5).things).not.toContain(flash);
  });
});
