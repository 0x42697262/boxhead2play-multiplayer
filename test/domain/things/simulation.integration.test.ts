import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/domain/math/Rng.ts';
import { createThingFactory } from '../../../src/domain/things/factory.ts';
import { ThingClass } from '../../../src/domain/things/ThingClass.ts';
import { DEVIL_COUNT_MAX, MAX_LIVE_ZOMBIES_DETAIL } from '../../../src/domain/upgrades/tuning.ts';
import { PlayerControl, type TickInput } from '../../../src/domain/world/input.ts';
import { World } from '../../../src/domain/world/World.ts';
import { assetAnimationCatalog, syntheticAnimationCatalog } from '../support/animationCatalog.ts';
import { held, tickInput } from '../support/input.ts';
import { assetRoom } from '../support/rooms.ts';
import { cellObject, room, settingsWith, solid } from '../support/fakes.ts';
import { InitKind } from '../../../src/domain/world/RoomDefinition.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';

const TICKS = 2000;
const SEED = 20071;
const MOVES: readonly PlayerControl[][] = [
  [PlayerControl.Right, PlayerControl.Fire],
  [PlayerControl.Down],
  [PlayerControl.Left, PlayerControl.Fire],
  [PlayerControl.Up, PlayerControl.Fire],
];
const PHASE_TICKS = 37;

function scriptedInput(tick: number): TickInput {
  const controls = MOVES[Math.floor(tick / PHASE_TICKS) % MOVES.length] ?? [];
  const fireEdge = tick % 2 === 0 ? controls : controls.filter((control) => control !== PlayerControl.Fire);
  return tickInput(held(...fireEdge), held(...fireEdge));
}

const fallbackRoom = room(24, 18, [
  solid(10, 6, 3, 3),
  cellObject(InitKind.Barrel, 6, 6, 1),
  cellObject(InitKind.Wall, 15, 10, 2),
  cellObject(InitKind.Pickup, 4, 12, 3),
  cellObject(InitKind.Zombie, 20, 3, 4),
  cellObject(InitKind.Zombie, 20, 14, 5),
  cellObject(InitKind.Zombie, 2, 15, 6),
  cellObject(InitKind.Devil, 21, 9, 7),
  cellObject(InitKind.Player2, 8, 14, 8),
  cellObject(InitKind.Player1, 4, 4, 9),
]);

interface RunSummary {
  readonly trace: string[];
  readonly maxCreatures: number;
  readonly nanPositions: number;
  readonly score: number;
  readonly ticks: number;
  readonly completion: string | undefined;
}

function run(gameMode: GameMode): RunSummary {
  const definition = assetRoom('ROOM_Single_0001') ?? fallbackRoom;
  const animations = assetAnimationCatalog() ?? syntheticAnimationCatalog();
  const world = World.create(definition, settingsWith({ gameMode, damageActive: false }), {
    rng: new SeededRng(SEED),
    factory: createThingFactory(),
    animations,
  });
  const trace: string[] = [];
  let maxCreatures = 0;
  let nanPositions = 0;
  for (let tick = 0; tick < TICKS && !world.completion; tick++) {
    world.update(scriptedInput(tick));
    const things = world.things.newestFirst();
    for (const thing of things) {
      const { x, y, z } = thing.position;
      if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) nanPositions++;
    }
    maxCreatures = Math.max(maxCreatures, world.things.count(ThingClass.Zombie) + world.things.count(ThingClass.Devil));
    if (tick % 100 === 0) trace.push(things.map((thing) => `${thing.key}:${thing.position.toString()}`).join('|'));
    world.events.drain();
  }
  return { trace, maxCreatures, nanPositions, score: world.hud.totalScore, ticks: world.tick, completion: world.completion };
}

describe('simulation integration', () => {
  it.each([GameMode.Single, GameMode.Coop, GameMode.DeathMatch])('runs 2000 ticks of %s play on a real room without NaN positions, within the creature cap, deterministically', (gameMode) => {
    const first = run(gameMode);
    const second = run(gameMode);
    expect(first.completion).toBeUndefined();
    expect(first.ticks).toBe(TICKS + 1);
    expect(first.nanPositions).toBe(0);
    if (gameMode !== GameMode.DeathMatch) expect(first.maxCreatures).toBeGreaterThan(0);
    expect(first.maxCreatures).toBeLessThanOrEqual(MAX_LIVE_ZOMBIES_DETAIL + DEVIL_COUNT_MAX);
    expect(second.trace).toEqual(first.trace);
    expect(second.score).toBe(first.score);
  });
});
