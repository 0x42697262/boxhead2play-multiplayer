import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CollideMask } from '../../../src/domain/map/CollideFlag.ts';
import { SeededRng } from '../../../src/domain/math/Rng.ts';
import { createThingFactory } from '../../../src/domain/things/factory.ts';
import { ThingFlag } from '../../../src/domain/things/ThingFlag.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { PlayerControl } from '../../../src/domain/world/input.ts';
import { PlayerCharacter } from '../../../src/domain/world/SimulationSettings.ts';
import { World } from '../../../src/domain/world/World.ts';
import { assetAnimationCatalog } from '../support/animationCatalog.ts';
import { settingsWith } from '../support/fakes.ts';
import { held, tickInput } from '../support/input.ts';
import { assetRoom } from '../support/rooms.ts';

const ROOMS_DIR = resolve(import.meta.dirname, '../../../public/assets/rooms');
const MOVES: readonly PlayerControl[] = [PlayerControl.Up, PlayerControl.Down, PlayerControl.Left, PlayerControl.Right];
const PLAYERS = 16;
const TICKS = 600;
const animations = assetAnimationCatalog();

function roomIds(): string[] {
  if (!animations) return [];
  return readdirSync(ROOMS_DIR)
    .filter((file) => file.startsWith('ROOM_'))
    .map((file) => file.replace('.json', ''));
}

function playersInWalls(world: World): string[] {
  return world
    .players()
    .filter((player) => !player.hasFlag(ThingFlag.Dead) && world.map.collideAt(player.position.x, player.position.y) & CollideMask.StaticImpassable)
    .map((player) => `player ${player.playerIndex} at ${player.position.toString()}`);
}

describe('player spawns in every room', () => {
  it.skipIf(!animations)('drop the ROOM_Single_0011 spawn marker inside the wall block at (16.45, 9.54)', () => {
    const definition = assetRoom('ROOM_Single_0011');
    if (!definition || !animations) return;
    const world = World.create(definition, settingsWith({ gameMode: GameMode.Coop }), { rng: new SeededRng(11), factory: createThingFactory(), animations });
    const points = world.spawnPoints.players;
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => !(point.cell.collide & CollideMask.StaticImpassable))).toBe(true);
    expect(points.some((point) => Math.trunc(point.position.x) === 16 && Math.trunc(point.position.y) === 9)).toBe(false);
  });

  it.skipIf(!animations)('give 16 players their own free cell in every room, at the start and on late joins', () => {
    const problems: string[] = [];
    for (const id of roomIds()) {
      const definition = assetRoom(id);
      if (!definition || !animations) continue;
      for (const gameMode of [GameMode.Coop, GameMode.DeathMatch]) {
        const playerCharacters = Array.from({ length: PLAYERS / 2 }, () => PlayerCharacter.Swat);
        const world = World.create(definition, settingsWith({ gameMode, playerCharacters }), { rng: new SeededRng(3), factory: createThingFactory(), animations });
        for (let index = PLAYERS / 2; index < PLAYERS; index++) world.joinPlayer(index, PlayerCharacter.Bambo);
        const cells = new Set(world.players().map((player) => `${player.position.cellX},${player.position.cellY}`));
        if (world.players().length !== PLAYERS || cells.size !== PLAYERS) problems.push(`${id} ${gameMode}: ${world.players().length} players on ${cells.size} cells`);
        problems.push(...playersInWalls(world).map((stuck) => `${id} ${gameMode}: ${stuck}`));
      }
    }
    expect(problems).toEqual([]);
  });

  it.skipIf(!animations)('never place or move a player inside a wall, also on spawn markers that the room art covers (ROOM_Single_0011)', () => {
    const stuck: string[] = [];
    for (const id of roomIds()) {
      const definition = assetRoom(id);
      if (!definition || !animations) continue;
      for (const gameMode of [GameMode.Coop, GameMode.DeathMatch]) {
        const world = World.create(definition, settingsWith({ gameMode }), { rng: new SeededRng(11), factory: createThingFactory(), animations });
        for (let index = 1; index < PLAYERS; index++) world.joinPlayer(index, PlayerCharacter.Swat);
        const moves = new SeededRng(7);
        let controls: PlayerControl[][] = [];
        for (let tick = 0; tick < TICKS && !world.completion; tick++) {
          if (tick % 15 === 0) controls = Array.from({ length: PLAYERS }, () => [MOVES[moves.int(MOVES.length)] ?? PlayerControl.Up, PlayerControl.Fire]);
          world.update(tickInput(...controls.map((list) => held(...list))));
          world.events.drain();
          const inWalls = playersInWalls(world);
          if (inWalls.length > 0) stuck.push(`${id} ${gameMode} tick ${tick}: ${inWalls.join(', ')}`);
          if (inWalls.length > 0) break;
        }
      }
    }
    expect(stuck).toEqual([]);
  }, 120_000);
});
