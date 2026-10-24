import { describe, expect, it } from 'vitest';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { InitKind } from '../../src/domain/world/RoomDefinition.ts';
import { netFrameFor } from '../../src/net/frames.ts';
import { at, cellObject, makeWorld, room } from '../domain/support/fakes.ts';

describe('netFrameFor screen effects', () => {
  it('sends the shake and the flash only in the frame of the player whose camera sees the explosion', () => {
    const { world } = makeWorld(room(60, 40, [cellObject(InitKind.Player1, 5, 5), cellObject(InitKind.Player2, 45, 30)]), {
      options: { gameMode: GameMode.Coop },
    });
    world.things.playerByIndex(0)?.move(at(5.5, 5.5));
    world.things.playerByIndex(1)?.move(at(45.5, 30.5));
    for (let i = 0; i < 40; i++) world.update();
    world.shake(at(10.5, 10.5), 0, 30);
    world.flashBrightness(at(10.5, 10.5), 1);
    world.update();
    const seeing = netFrameFor(world, 0, []);
    const away = netFrameFor(world, 1, []);
    expect(seeing?.brightness).toBeCloseTo(0.8);
    expect(seeing && seeing.camera.drawOrigin.y - seeing.camera.rect.y).toBeCloseTo(-15);
    expect(away?.brightness).toBe(0);
    expect(away && away.camera.drawOrigin.y - away.camera.rect.y).toBe(0);
  });
});
