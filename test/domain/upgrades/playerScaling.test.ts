import { describe, expect, it } from 'vitest';
import { extraEnemies, extraPlayers, liveDevilCap, liveZombieCap } from '../../../src/domain/upgrades/playerScaling.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { cellObject, makeWorld, room } from '../support/fakes.ts';

const base = { zombieCount: 10, zombieTotalCount: 10, devilCount: 2, devilTotalCount: 4 };

describe('enemies scaled by player count', () => {
  it('adds nothing for one player and half the level count per extra player from the second', () => {
    expect(extraPlayers(1)).toBe(0);
    expect(extraPlayers(2)).toBe(1);
    expect(extraPlayers(16)).toBe(15);
    expect(extraEnemies(base, 1)).toEqual({ zombieCount: 0, zombieTotalCount: 0, devilCount: 0, devilTotalCount: 0 });
    expect(extraEnemies(base, 2)).toEqual({ zombieCount: 5, zombieTotalCount: 5, devilCount: 1, devilTotalCount: 2 });
    expect(extraEnemies(base, 5)).toEqual({ zombieCount: 20, zombieTotalCount: 20, devilCount: 4, devilTotalCount: 8 });
  });

  it('raises the live caps with the players, keeping the original caps for one player and a hard limit', () => {
    expect(liveZombieCap(60, 1)).toBe(60);
    expect(liveZombieCap(60, 2)).toBe(90);
    expect(liveZombieCap(60, 16)).toBe(120);
    expect(liveDevilCap(1)).toBe(Number.POSITIVE_INFINITY);
    expect(liveDevilCap(4)).toBe(20);
  });

  it('gives the current level more zombies when players join and takes them back when they leave', () => {
    const { world } = makeWorld(room(20, 12, [cellObject(InitKind.Player1, 2, 2), cellObject(InitKind.Player2, 6, 2), cellObject(InitKind.Player2, 10, 2)]), {
      options: { gameMode: GameMode.Coop, playerCharacters: [0] },
    });
    world.update();
    expect(world.upgrades.level.zombieTotalCount).toBe(10);
    world.joinPlayer(1, 0);
    world.joinPlayer(2, 0);
    world.update();
    expect(world.upgrades.level).toMatchObject({ zombieCount: 20, zombieTotalCount: 20 });
    world.leavePlayer(2);
    world.leavePlayer(1);
    world.update();
    expect(world.upgrades.level).toMatchObject({ zombieCount: 10, zombieTotalCount: 10 });
  });
});
