import { describe, expect, it } from 'vitest';
import { devilSpawnRate, extraEnemies, extraPlayers, liveDevilCap, liveZombieCap } from '../../../src/domain/upgrades/playerScaling.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { Difficulty } from '../../../src/domain/world/SimulationSettings.ts';
import { cellObject, makeWorld, room } from '../support/fakes.ts';

const DEVIL_TEST_TICKS = 750;
const base = { zombieCount: 10, zombieTotalCount: 10, devilCount: 2, devilTotalCount: 4 };

describe('enemies scaled by player count', () => {
  it('adds nothing for one player, half the zombies and all the devils of the level per extra player from the second', () => {
    expect(extraPlayers(1)).toBe(0);
    expect(extraPlayers(2)).toBe(1);
    expect(extraPlayers(16)).toBe(15);
    expect(extraEnemies(base, 1)).toEqual({ zombieCount: 0, zombieTotalCount: 0, devilCount: 0, devilTotalCount: 0 });
    expect(extraEnemies(base, 2)).toEqual({ zombieCount: 5, zombieTotalCount: 5, devilCount: 2, devilTotalCount: 4 });
    expect(extraEnemies(base, 5)).toEqual({ zombieCount: 20, zombieTotalCount: 20, devilCount: 8, devilTotalCount: 16 });
    expect(extraEnemies({ zombieCount: 3, zombieTotalCount: 3, devilCount: 1, devilTotalCount: 1 }, 2)).toEqual({ zombieCount: 1, zombieTotalCount: 1, devilCount: 1, devilTotalCount: 1 });
  });

  it('raises the zombie cap with the players up to a hard limit and leaves devils uncapped', () => {
    expect(liveZombieCap(60, 1)).toBe(60);
    expect(liveZombieCap(60, 2)).toBe(90);
    expect(liveZombieCap(60, 16)).toBe(120);
    expect(liveDevilCap(1)).toBe(Number.POSITIVE_INFINITY);
    expect(liveDevilCap(16)).toBe(Number.POSITIVE_INFINITY);
  });

  it('spawns devils as many times faster as there are players, down to one tick', () => {
    expect(devilSpawnRate(250, 1)).toBe(250);
    expect(devilSpawnRate(250, 0)).toBe(250);
    expect(devilSpawnRate(250, 8)).toBe(31);
    expect(devilSpawnRate(25, 16)).toBe(1);
    expect(devilSpawnRate(25, 100)).toBe(1);
  });

  it('keeps about as many more devils alive at once as there are players on an expert level', () => {
    const mostDevils = (players: number): number => {
      const doors = [cellObject(InitKind.Devil, 30, 3), cellObject(InitKind.Devil, 30, 10), cellObject(InitKind.Devil, 30, 17)];
      const { world } = makeWorld(room(40, 22, [cellObject(InitKind.Player1, 2, 2), ...doors]), {
        options: { gameMode: GameMode.Coop, difficulty: Difficulty.Expert, playerCharacters: Array.from({ length: players }, () => 0) },
      });
      let most = 0;
      for (let tick = 0; tick < DEVIL_TEST_TICKS; tick++) {
        world.update();
        most = Math.max(most, world.upgrades.level.liveDevils);
      }
      return most;
    };
    const alone = mostDevils(1);
    expect(alone).toBe(3);
    expect(mostDevils(8)).toBeGreaterThanOrEqual(alone * 8);
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
