import { describe, expect, it } from 'vitest';
import { DomainEventType, type DomainEvent } from '../../../src/domain/events.ts';
import { CollideFlag } from '../../../src/domain/map/CollideFlag.ts';
import { SeededRng } from '../../../src/domain/math/Rng.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { ThingFlag } from '../../../src/domain/things/ThingFlag.ts';
import { CompletionState } from '../../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { IDLE_TICK_INPUT } from '../../../src/domain/world/input.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { GameAmount, GameSpeed } from '../../../src/domain/world/SimulationSettings.ts';
import { MAX_PLAYERS, PLAYER_SPAWN_CLEARANCE_CELLS } from '../../../src/domain/world/tuning.ts';
import type { World } from '../../../src/domain/world/World.ts';
import type { FakePlayer } from '../support/fakes.ts';
import { FakeThing, at, cellObject, makeWorld, room, solid } from '../support/fakes.ts';

const basicRoom = () =>
  room(20, 12, [
    solid(8, 3, 2, 2, 0),
    cellObject(InitKind.Barrel, 4, 4, 1),
    cellObject(InitKind.Wall, 5, 4, 2),
    cellObject(InitKind.Pickup, 6, 4, 3),
    cellObject(InitKind.Zombie, 15, 8, 4),
    cellObject(InitKind.Devil, 16, 8, 5),
    cellObject(InitKind.Player2, 12, 6, 6, 180),
    cellObject(InitKind.Player1, 2, 2, 7, 90),
  ]);

function ofType<T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T): Extract<DomainEvent, { type: T }>[] {
  return events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type);
}

describe('World initialisation', () => {
  it('builds collision, objects and spawn points from the room definition', () => {
    const { world } = makeWorld(basicRoom());
    expect(world.map.cell(8, 3).collide & CollideFlag.Solid).toBeTruthy();
    expect(world.map.cell(9, 4).collide & CollideFlag.Solid).toBeTruthy();
    const classes = world.things.newestFirst().map((thing) => thing.classId);
    expect(classes).toEqual(expect.arrayContaining([ThingClass.Barrel, ThingClass.Wall, ThingClass.Pickup, ThingClass.Player]));
    const barrel = world.things.newestFirst().find((thing) => thing.classId === ThingClass.Barrel);
    expect(barrel?.position).toEqual(at(4.5, 4.5));
    expect(world.spawnPoints.zombies).toHaveLength(1);
    expect(world.spawnPoints.devils).toHaveLength(1);
    expect(world.spawnPoints.players).toHaveLength(2);
  });

  it('starts player 1 on the Player1 marker facing its rotation, and one player per character', () => {
    const single = makeWorld(basicRoom()).world;
    const players = single.things.players();
    expect(players).toHaveLength(1);
    expect(players[0]?.position).toEqual(at(2.5, 2.5));
    expect(players[0]?.angle.radians).toBeCloseTo(Math.PI / 2);
    const coop = makeWorld(basicRoom(), { options: { gameMode: GameMode.Coop } }).world;
    expect(coop.things.players()).toHaveLength(2);
    expect(coop.upgrades.totalPlayerCount).toBe(2);
    const four = makeWorld(basicRoom(), { options: { gameMode: GameMode.Coop, playerCharacters: [0, 1, 2, 3] } }).world;
    expect(four.things.players().map((player) => player.playerIndex).sort()).toEqual([0, 1, 2, 3]);
    const cells = new Set(four.things.players().map((player) => `${Math.trunc(player.position.x)},${Math.trunc(player.position.y)}`));
    expect(cells.size).toBe(4);
  });

  it('runs one tick while loading and switches to the game speed afterwards', () => {
    const { world } = makeWorld(basicRoom(), { options: { gameSpeed: GameSpeed.Slow } });
    expect(world.tick).toBe(1);
    expect(world.ticksPerSecond).toBe(12.5);
    expect((world.things.players()[0] as unknown as FakePlayer).processed).toBe(1);
  });
});

describe('World kills and score', () => {
  it('awards thing score times the multiplier and drops a pickup on every fifth multiple kill', () => {
    const { world, factory } = makeWorld(basicRoom());
    world.events.drain();
    for (let kill = 1; kill <= 5; kill++) {
      const zombie = new FakeThing(world, at(10.5, 8.5), ThingClass.Zombie);
      zombie.score = 100;
      world.upgrades.zombieSpawned();
      world.logKill(zombie);
    }
    const scores = ofType(world.events.drain(), DomainEventType.ScoreAwarded).map((event) => event.points);
    expect(scores).toEqual([200, 300, 400, 500, 600]);
    expect(world.hud.totalScore).toBe(2000);
    expect(factory.dropped).toHaveLength(1);
    expect(factory.dropped[0]?.lifetimeTicks).toBe(250);
  });

  it('always drops a pickup for devils, but never on a solid cell', () => {
    const { world, factory } = makeWorld(basicRoom());
    world.logKill(new FakeThing(world, at(10.5, 8.5), ThingClass.Devil));
    world.logKill(new FakeThing(world, at(8.5, 3.5), ThingClass.Devil));
    expect(factory.dropped).toHaveLength(1);
  });

  it('counts player deaths without score and drops pickups only in deathmatch', () => {
    const { world, factory } = makeWorld(basicRoom(), { options: { gameMode: GameMode.DeathMatch } });
    const [second] = world.things.players();
    if (!second) throw new Error('missing player');
    world.logKill(second);
    expect(world.hud.deathsOf(second.playerIndex)).toBe(1);
    expect(world.hud.totalScore).toBe(0);
    expect(factory.dropped).toHaveLength(1);
  });
});

describe('World completion', () => {
  it('ends single and coop games when no player is left', () => {
    const { world } = makeWorld(basicRoom());
    world.logKill(world.things.players()[0] as unknown as FakePlayer);
    world.playerDead();
    expect(world.completion).toBe(CompletionState.PlayerDead);
    world.update();
    world.update();
    expect(ofType(world.events.drain(), DomainEventType.WorldCompleted)).toHaveLength(0);
  });

  it('emits the completion once at the end of the tick it happened in', () => {
    const { world } = makeWorld(basicRoom());
    world.events.drain();
    world.update({ ...IDLE_TICK_INPUT, quitRequested: true });
    world.update();
    expect(ofType(world.events.drain(), DomainEventType.WorldCompleted)).toEqual([
      { type: DomainEventType.WorldCompleted, state: CompletionState.Quit },
    ]);
  });

  it('gives nobody a frag for a death without another player as killer, and counts the death', () => {
    const { world } = makeWorld(basicRoom(), { options: { gameMode: GameMode.DeathMatch, gameAmount: GameAmount.Kills5, playerCharacters: [0, 1, 2] } });
    const victim = world.things.playerByIndex(0) as unknown as FakePlayer;
    for (let i = 0; i < 5; i++) world.logKill(victim);
    victim.lastAttackerIndex = 0;
    world.logKill(victim);
    world.playerDead();
    expect(world.hud.frags.slice(0, 3)).toEqual([0, 0, 0]);
    expect(world.hud.deathsOf(0)).toBe(6);
    expect(world.completion).toBeUndefined();
  });

  it('ends the deathmatch when a player reaches the kill target', () => {
    const { world } = makeWorld(basicRoom(), { options: { gameMode: GameMode.DeathMatch, gameAmount: GameAmount.Kills5 } });
    const victim = world.things.playerByIndex(0) as unknown as FakePlayer;
    victim.lastAttackerIndex = 1;
    for (let i = 0; i < 4; i++) world.logKill(victim);
    world.playerDead();
    expect(world.completion).toBeUndefined();
    world.logKill(victim);
    world.playerDead();
    expect(world.completion).toBe(CompletionState.PlayerWon);
    expect(world.winnerIndex).toBe(1);
    expect(world.hud.fragsOf(1)).toBe(5);
  });

  it('credits only the last attacker when several players play deathmatch', () => {
    const { world } = makeWorld(basicRoom(), { options: { gameMode: GameMode.DeathMatch, gameAmount: GameAmount.Kills5, playerCharacters: [0, 1, 2] } });
    const victim = world.things.playerByIndex(0) as unknown as FakePlayer;
    victim.lastAttackerIndex = 2;
    world.logKill(victim);
    expect(world.hud.frags.slice(0, 3)).toEqual([0, 0, 1]);
    victim.lastAttackerIndex = 1;
    world.logKill(victim);
    expect(world.hud.frags.slice(0, 3)).toEqual([0, 1, 1]);
  });
});

describe('World screen effects', () => {
  it('halves and flips the shake every tick until it rests', () => {
    const { world } = makeWorld(basicRoom());
    world.shake(0, 30);
    world.update();
    expect(world.presentation.shake.y).toBeCloseTo(-15);
    world.update();
    expect(world.presentation.shake.y).toBeCloseTo(7.5);
    for (let i = 0; i < 10; i++) world.update();
    expect(world.presentation.shake.y).toBe(0);
  });

  it('fades the start flash and explosion flashes in 0.2 steps', () => {
    const { world } = makeWorld(basicRoom());
    expect(world.presentation.brightness).toBeCloseTo(0.8);
    world.update();
    expect(world.presentation.brightness).toBeCloseTo(0.6);
    world.flashBrightness(1);
    world.update();
    expect(world.presentation.brightness).toBeCloseTo(0.8);
  });

  it('centres the camera on the tracked player, clamped one cell inside the room', () => {
    const { world } = makeWorld(room(40, 30, [cellObject(InitKind.Player1, 20, 15)]));
    const [camera] = world.presentation.cameras;
    expect(camera?.rect).toEqual({ x: 336, y: 256, width: 640, height: 480 });
    expect(world.screenPosition(at(20.5, 15.5))).toEqual({ x: 320, y: 240 });
  });

  it('gives every player a full-size camera that follows only that player', () => {
    const { world } = makeWorld(room(40, 30, [cellObject(InitKind.Player1, 5, 5), cellObject(InitKind.Player2, 20, 12)]), {
      options: { gameMode: GameMode.DeathMatch },
    });
    expect(world.presentation.cameras.map((camera) => camera.playerIndex)).toEqual([0, 1]);
    expect(world.presentation.cameras.map((camera) => camera.rect.width)).toEqual([640, 640]);
    expect(world.cameraFor(0)?.rect.x).toBe(32);
    const second = world.things.playerByIndex(1);
    if (!second) throw new Error('missing player');
    second.move(at(20.5, 12.5));
    world.update();
    expect(world.cameraFor(1)?.rect.x).toBe(336);
    second.flags |= ThingFlag.Dead;
    world.update();
    expect(world.cameraFor(1)?.rect.x).toBe(336);
    expect(world.cameraFor(0)?.rect.x).toBe(32);
  });
});

describe('World random player spawns', () => {
  const spawnRoom = () => room(40, 30, [cellObject(InitKind.Player1, 5, 5), cellObject(InitKind.Player2, 6, 5), cellObject(InitKind.Zombie, 30, 20), solid(20, 0, 1, 30)]);
  const cells = (world: World): string[] => world.things.players().map((player) => `${Math.trunc(player.position.x)},${Math.trunc(player.position.y)}`);

  it.each([GameMode.Single, GameMode.Coop, GameMode.DeathMatch])('spreads 16 %s players over the floor reachable from the markers, away from each other and enemy spawns', (gameMode) => {
    const count = gameMode === GameMode.Single ? 1 : MAX_PLAYERS;
    const { world } = makeWorld(spawnRoom(), { options: { gameMode, playerCharacters: Array.from({ length: count }, () => 0) }, spawnRng: new SeededRng(11) });
    const players = world.things.players();
    expect(players).toHaveLength(count);
    for (const player of players) {
      expect(player.position.x).toBeLessThan(20);
      for (const other of players) {
        if (other === player) continue;
        expect(Math.max(Math.abs(other.position.x - player.position.x), Math.abs(other.position.y - player.position.y))).toBeGreaterThan(PLAYER_SPAWN_CLEARANCE_CELLS);
      }
    }
  });

  it('puts players in different places for different seeds, the same places for the same seed', () => {
    const options = { gameMode: GameMode.DeathMatch, playerCharacters: [0, 1, 2, 3] as const };
    const run = (seed: number) => cells(makeWorld(spawnRoom(), { options, spawnRng: new SeededRng(seed) }).world);
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it('respawns on a random free cell, not next to the other players', () => {
    const { world } = makeWorld(spawnRoom(), { options: { gameMode: GameMode.Coop }, spawnRng: new SeededRng(5) });
    const point = world.playerRespawnPoint();
    expect(point).toBeDefined();
    for (const player of world.things.players()) {
      expect(point && Math.max(Math.abs(point.position.x - player.position.x), Math.abs(point.position.y - player.position.y))).toBeGreaterThan(PLAYER_SPAWN_CLEARANCE_CELLS);
    }
  });
});

describe('World players joining and leaving', () => {
  it('spawns a late player at the lowest free index and removes a leaving one', () => {
    const { world } = makeWorld(basicRoom(), { options: { gameMode: GameMode.Coop } });
    expect(world.freePlayerIndex()).toBe(2);
    expect(world.joinPlayer(2, 3)).toBe(true);
    expect(world.joinPlayer(2, 3)).toBe(false);
    expect(world.upgrades.totalPlayerCount).toBe(3);
    expect(world.leavePlayer(1)).toBe(true);
    world.update();
    expect(world.things.players().map((player) => player.playerIndex).sort()).toEqual([0, 2]);
    expect(world.upgrades.playerCount).toBe(2);
    expect(world.freePlayerIndex()).toBe(1);
    expect(world.leavePlayer(1)).toBe(false);
  });
});
