import { describe, expect, it } from 'vitest';
import { DomainEventType, MessageTone, type DomainEvent } from '../../../src/domain/events.ts';
import { CollideFlag, CollideMask } from '../../../src/domain/map/CollideFlag.ts';
import { SeededRng } from '../../../src/domain/math/Rng.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { ThingFlag } from '../../../src/domain/things/ThingFlag.ts';
import { CompletionState } from '../../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { IDLE_CONTROL, IDLE_PLAYER_INPUT, IDLE_TICK_INPUT } from '../../../src/domain/world/input.ts';
import { InitKind, type RoomInitObject } from '../../../src/domain/world/RoomDefinition.ts';
import { GameAmount, GameSpeed, LOCAL_SIMULATION_HOST, SERVER_SIMULATION_HOST, type SimulationHost } from '../../../src/domain/world/SimulationSettings.ts';
import { cellDistance } from '../../../src/domain/world/spawning.ts';
import { MAX_PLAYERS, PLAYER_SPAWN_DOOR_CLEARANCE_CELLS } from '../../../src/domain/world/tuning.ts';
import type { World } from '../../../src/domain/world/World.ts';
import type { FakePlayer } from '../support/fakes.ts';
import { FakeThing, at, cellObject, makeWorld, place, room, solid, cellOf } from '../support/fakes.ts';

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
    expect(cellOf(world, 8, 3).collide & CollideFlag.Solid).toBeTruthy();
    expect(cellOf(world, 9, 4).collide & CollideFlag.Solid).toBeTruthy();
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
    world.shake(at(2.5, 2.5), 0, 30);
    world.update();
    expect(world.effectsFor(0).shake.y).toBeCloseTo(-15);
    world.update();
    expect(world.effectsFor(0).shake.y).toBeCloseTo(7.5);
    for (let i = 0; i < 10; i++) world.update();
    expect(world.effectsFor(0).shake.y).toBe(0);
  });

  it('fades the start flash and explosion flashes in 0.2 steps', () => {
    const { world } = makeWorld(basicRoom());
    expect(world.effectsFor(0).brightness).toBeCloseTo(0.8);
    world.update();
    expect(world.effectsFor(0).brightness).toBeCloseTo(0.6);
    world.flashBrightness(at(2.5, 2.5), 1);
    world.update();
    expect(world.effectsFor(0).brightness).toBeCloseTo(0.8);
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

  it('lets a dead player pan the camera with the movement keys and returns it on respawn', () => {
    const { world } = makeWorld(room(40, 30, [cellObject(InitKind.Player1, 5, 5), cellObject(InitKind.Player2, 20, 12)]), {
      options: { gameMode: GameMode.DeathMatch },
    });
    const second = world.things.playerByIndex(1);
    if (!second) throw new Error('missing player');
    second.move(at(20.5, 12.5));
    world.update();
    second.flags |= ThingFlag.Dead;
    const right = { ...IDLE_PLAYER_INPUT, right: { ...IDLE_CONTROL, down: true } };
    for (let tick = 0; tick < 10; tick++) world.update({ ...IDLE_TICK_INPUT, players: [IDLE_PLAYER_INPUT, right] });
    expect(world.cameraFor(1)?.rect.x).toBe(336 + 128);
    expect(world.cameraFor(0)?.rect.x).toBe(32);
    for (let tick = 0; tick < 100; tick++) world.update({ ...IDLE_TICK_INPUT, players: [IDLE_PLAYER_INPUT, right] });
    expect(world.cameraFor(1)?.rect.x).toBe(1280 - 640 - 32);
    second.flags &= ~ThingFlag.Dead;
    world.update();
    expect(world.cameraFor(1)?.rect.x).toBe(336);
  });
});

describe('World screen effects per camera', () => {
  const farApart = () => {
    const { world } = makeWorld(room(60, 40, [cellObject(InitKind.Player1, 5, 5), cellObject(InitKind.Player2, 45, 30)]), {
      options: { gameMode: GameMode.DeathMatch },
    });
    world.things.playerByIndex(0)?.move(at(5.5, 5.5));
    world.things.playerByIndex(1)?.move(at(45.5, 30.5));
    for (let i = 0; i < 5; i++) world.update();
    return world;
  };
  const shakes = (world: World): number[] => world.presentation.cameras.map((camera) => camera.drawOrigin.y - camera.rect.y);
  const brightness = (world: World): number[] => world.presentation.cameras.map((camera) => world.effectsFor(camera.playerIndex).brightness);

  it('shakes and flashes only the camera that sees the source', () => {
    const world = farApart();
    expect(world.cameraFor(0)?.rect).toEqual({ x: 32, y: 32, width: 640, height: 480 });
    expect(world.cameraFor(1)?.rect).toEqual({ x: 1136, y: 736, width: 640, height: 480 });
    world.shake(at(10.5, 10.5), 0, 30);
    world.flashBrightness(at(10.5, 10.5), 1);
    world.update();
    expect(shakes(world)).toEqual([-15, 0]);
    expect(brightness(world)).toEqual([0.8, 0]);
  });

  it('shakes and flashes no camera for a source outside every view and its margin', () => {
    const world = farApart();
    world.shake(at(30.5, 30.5), 0, 30);
    world.flashBrightness(at(30.5, 30.5), 1);
    world.update();
    expect(shakes(world)).toEqual([0, 0]);
    expect(brightness(world)).toEqual([0, 0]);
  });

  it('counts a source just past the view edge as visible, within the margin', () => {
    const world = farApart();
    world.shake(at(23, 10), 0, 30);
    world.update();
    expect(shakes(world)).toEqual([-15, 0]);
    for (let i = 0; i < 10; i++) world.update();
    world.shake(at(25, 10), 0, 30);
    world.update();
    expect(shakes(world)).toEqual([0, 0]);
  });

  it('starts a late joiner without effects and forgets a leaving player', () => {
    const world = farApart();
    world.shake(at(10.5, 10.5), 0, 30);
    world.flashBrightness(at(10.5, 10.5), 1);
    expect(world.joinPlayer(2, 0)).toBe(true);
    world.update();
    expect(world.effectsFor(2)).toEqual({ shake: { x: 0, y: 0 }, brightness: 0 });
    expect(world.leavePlayer(0)).toBe(true);
    world.update();
    expect(world.presentation.effects.has(0)).toBe(false);
    expect(world.effectsFor(0)).toEqual({ shake: { x: 0, y: 0 }, brightness: 0 });
  });
});

describe('World random player spawns', () => {
  const spawnRoom = () => room(40, 30, [cellObject(InitKind.Player1, 5, 5), cellObject(InitKind.Player2, 6, 5), cellObject(InitKind.Zombie, 30, 20), solid(20, 0, 1, 30)]);
  const openRoom = (doors: RoomInitObject[] = []) => room(40, 10, [cellObject(InitKind.Player1, 20, 5), ...doors]);
  const cells = (world: World): string[] => world.things.players().map((player) => `${Math.trunc(player.position.x)},${Math.trunc(player.position.y)}`);
  const SEEDS = Array.from({ length: 10 }, (_unused, index) => index + 1);
  const FAR_END_CELLS = 10;

  it.each([GameMode.Single, GameMode.Coop, GameMode.DeathMatch])('puts all %s players on different free cells of the floor reachable from the markers', (gameMode) => {
    const count = gameMode === GameMode.Single ? 1 : MAX_PLAYERS;
    const { world } = makeWorld(spawnRoom(), { options: { gameMode, playerCharacters: Array.from({ length: count }, () => 0) }, spawnRng: new SeededRng(11) });
    const players = world.things.players();
    expect(players).toHaveLength(count);
    expect(new Set(cells(world)).size).toBe(count);
    for (const player of players) expect(player.position.x).toBeLessThan(20);
  });

  it('lets 16 players start next to each other when the room is small', () => {
    const { world } = makeWorld(room(6, 6, [cellObject(InitKind.Player1, 2, 2)]), { options: { gameMode: GameMode.Coop, playerCharacters: Array.from({ length: MAX_PLAYERS }, () => 0) }, spawnRng: new SeededRng(2) });
    expect(new Set(cells(world)).size).toBe(MAX_PLAYERS);
  });

  it('puts players in different places for different seeds, the same places for the same seed', () => {
    const options = { gameMode: GameMode.DeathMatch, playerCharacters: [0, 1, 2, 3] as const };
    const run = (seed: number) => cells(makeWorld(spawnRoom(), { options, spawnRng: new SeededRng(seed) }).world);
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it.each(SEEDS)('respawns at the far end of an open room when a zombie stands at the other end (seed %i)', (seed) => {
    const { world } = makeWorld(openRoom(), { options: { gameMode: GameMode.Coop }, spawnRng: new SeededRng(seed) });
    place(world, new FakeThing(world, at(38.5, 5.5), ThingClass.Zombie));
    expect(world.playerRespawnPoint()?.cell.x).toBeLessThan(FAR_END_CELLS);
  });

  it.each(SEEDS)('ignores dead zombies and keeps away from devils too (seed %i)', (seed) => {
    const { world } = makeWorld(openRoom(), { options: { gameMode: GameMode.Coop }, spawnRng: new SeededRng(seed) });
    place(world, new FakeThing(world, at(1.5, 5.5), ThingClass.Zombie), undefined, ThingFlag.Dead);
    place(world, new FakeThing(world, at(38.5, 5.5), ThingClass.Devil));
    expect(world.playerRespawnPoint()?.cell.x).toBeLessThan(FAR_END_CELLS);
  });

  it.each(SEEDS)('spawns away from zombie and devil doors when no enemy is alive (seed %i)', (seed) => {
    const doors = [cellObject(InitKind.Zombie, 3, 5), cellObject(InitKind.Devil, 36, 5)];
    const { world } = makeWorld(openRoom(doors), { options: { gameMode: GameMode.Coop }, spawnRng: new SeededRng(seed) });
    const point = world.playerRespawnPoint();
    for (const door of [...world.spawnPoints.zombies, ...world.spawnPoints.devils]) {
      expect(point && cellDistance(point.cell, door.cell)).toBeGreaterThanOrEqual(PLAYER_SPAWN_DOOR_CLEARANCE_CELLS);
    }
  });

  it('still spawns when every floor cell is next to a door', () => {
    const { world } = makeWorld(room(8, 8, [cellObject(InitKind.Player1, 1, 1), cellObject(InitKind.Zombie, 4, 4)]), { options: { gameMode: GameMode.Coop }, spawnRng: new SeededRng(1) });
    expect(world.spawnPoints.zombies).toHaveLength(1);
    expect(world.things.players()).toHaveLength(2);
    expect(world.playerRespawnPoint()).toBeDefined();
  });

  it.each(SEEDS)('never respawns inside a wall (seed %i)', (seed) => {
    const { world } = makeWorld(room(20, 12, [cellObject(InitKind.Player1, 1, 1), solid(4, 0, 2, 9), solid(10, 3, 2, 9), solid(15, 0, 1, 9)]), {
      options: { gameMode: GameMode.Coop },
      spawnRng: new SeededRng(seed),
    });
    const point = world.playerRespawnPoint();
    expect(point && point.cell.collide & CollideMask.StaticImpassable).toBe(0);
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

  it('starts a late player with no kills or deaths, even on the index of a player who left', () => {
    const { world } = makeWorld(basicRoom(), { options: { gameMode: GameMode.DeathMatch } });
    world.hud.recordDeath({ victim: 0, killer: 1 });
    world.hud.recordDeath({ victim: 1, killer: 0 });
    expect(world.leavePlayer(1)).toBe(true);
    world.update();
    expect(world.joinPlayer(1, 3)).toBe(true);
    expect(world.hud.fragsOf(1)).toBe(0);
    expect(world.hud.deathsOf(1)).toBe(0);
    expect(world.hud.fragsOf(0)).toBe(1);
    expect(world.hud.deathsOf(0)).toBe(1);
  });

  it('announces a late player in yellow with the name resolved on the client', () => {
    const { world } = makeWorld(basicRoom(), { options: { gameMode: GameMode.Coop } });
    const before = world.hud.messages.length;
    expect(world.joinPlayer(2, 3)).toBe(true);
    expect(world.hud.messages.slice(before)).toEqual([expect.objectContaining({ tone: MessageTone.Joined, text: { key: 'hud.joined' }, names: { player: 2 } })]);
    expect(world.joinPlayer(2, 3)).toBe(false);
    expect(world.hud.messages.length).toBe(before + 1);
  });
});

describe('World zombie ambience', () => {
  const AMBIENCE_EVENTS: readonly DomainEvent['type'][] = [DomainEventType.AmbienceRequested, DomainEventType.AmbienceStopped];

  function ambienceEvents(host: SimulationHost): DomainEvent[] {
    const { world } = makeWorld(basicRoom(), { host });
    for (let index = 0; index < 9; index++) place(world, new FakeThing(world, at(10.5 + index, 6.5), ThingClass.Zombie));
    world.events.drain();
    for (let tick = 0; tick < 3; tick++) world.update();
    return world.events.drain().filter((event) => AMBIENCE_EVENTS.includes(event.type));
  }

  it('plays the ambience for visible zombies locally and skips it on the server', () => {
    expect(ambienceEvents(LOCAL_SIMULATION_HOST).length).toBeGreaterThan(0);
    expect(ambienceEvents(SERVER_SIMULATION_HOST)).toEqual([]);
  });
});
