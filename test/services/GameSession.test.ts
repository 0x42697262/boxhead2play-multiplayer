import { MAX_PLAYERS } from '../../src/domain/world/tuning.ts';
import { describe, expect, it } from 'vitest';
import type { SampleExtras } from '../../src/adapters/input/TickInputSampler.ts';
import type { WorldFrame } from '../../src/adapters/render/world/WorldFrame.ts';
import { EMPTY_ANIMATION_CATALOG } from '../../src/domain/animation/AnimationCatalog.ts';
import { DecalKind, DomainEventType, type DecalRequested, type ScoreAwarded } from '../../src/domain/events.ts';
import { SequenceRng } from '../../src/domain/math/Rng.ts';
import { SoundId } from '../../src/domain/sounds.ts';
import type { MultiplierListEntry } from '../../src/domain/upgrades/Upgrades.ts';
import { CompletionState } from '../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { IDLE_TICK_INPUT, type TickInput } from '../../src/domain/world/input.ts';
import { InitKind } from '../../src/domain/world/RoomDefinition.ts';
import { DEFAULT_GAME_OPTIONS } from '../../src/domain/world/SimulationSettings.ts';
import { silentLogger } from '../../src/observability/logger.ts';
import { GameSession, type SessionResult } from '../../src/services/GameSession.ts';
import { cellObject, FakeFactory, room } from '../domain/support/fakes.ts';

class Recorder {
  readonly sounds: SoundId[] = [];
  readonly decals: DecalRequested[] = [];
  readonly scores: ScoreAwarded[] = [];
  readonly upgradeLists: (readonly MultiplierListEntry[] | undefined)[] = [];
  readonly upgradeKeyPresses: boolean[] = [];
  readonly frames: WorldFrame[] = [];
  readonly extras: SampleExtras[] = [];
  readonly results: SessionResult[] = [];
  readonly inputs: TickInput[] = [];
  ambience = 0;
  ambienceStops = 0;
}

function startSession(mode: GameMode = GameMode.Single): { session: GameSession; record: Recorder } {
  const record = new Recorder();
  const session = GameSession.start({
    room: room(30, 20, [cellObject(InitKind.Player1, 5, 5)]),
    options: { ...DEFAULT_GAME_OPTIONS, gameMode: mode },
    rng: new SequenceRng([0.5]),
    factory: new FakeFactory(),
    animations: EMPTY_ANIMATION_CATALOG,
    audio: {
      play: (sound) => record.sounds.push(sound),
      stopAmbience: () => record.ambienceStops++,
      ambiencePlaying: () => record.ambience,
    },
    scene: {
      stampDecal: (event) => record.decals.push(event),
      awardScore: (event) => record.scores.push(event),
      showUpgrades: (upgrades) => record.upgradeLists.push(upgrades),
      render: (frame) => record.frames.push(frame),
    },
    input: {
      sample: (extras) => {
        record.extras.push(extras);
        return { tick: { ...(record.inputs.shift() ?? IDLE_TICK_INPUT), ...extras }, upgradeListPressed: record.upgradeKeyPresses.shift() ?? false };
      },
    },
    logger: silentLogger,
    onCompleted: (result) => record.results.push(result),
  });
  return { session, record };
}

const DECAL: DecalRequested = {
  type: DomainEventType.DecalRequested,
  decal: DecalKind.BloodSplat,
  symbol: 'Effect.BloodSplat',
  xPx: 10,
  yPx: 20,
  frame: 1,
  rotationIndex: 2,
  rotationCount: 3,
  scaleX: 1,
  scaleY: 0.6,
};

describe('GameSession', () => {
  it('renders the first frame after World.create like InitCleanUp', () => {
    const { record, session } = startSession();
    expect(record.frames).toHaveLength(1);
    expect(record.frames[0]?.cameras).toHaveLength(1);
    expect(record.frames[0]?.hud.players).toHaveLength(1);
    expect(session.ticksPerSecond).toBe(25);
  });

  it('routes sounds, ambience, decals and score popups to the adapters in order', () => {
    const { session, record } = startSession();
    const events = session.world.events;
    events.emit({ type: DomainEventType.SoundRequested, sound: SoundId.PistolFire });
    events.emit({ type: DomainEventType.AmbienceRequested, sound: SoundId.ZombieAmbience2, maxChannels: 2 });
    events.emit({ type: DomainEventType.AmbienceStopped });
    events.emit(DECAL);
    events.emit({ type: DomainEventType.ScoreAwarded, points: 100, worldPosition: { x: 1, y: 1, z: 0 }, screenPosition: { x: 5, y: 6 } });
    session.tick();
    expect(record.sounds).toEqual([SoundId.PistolFire, SoundId.ZombieAmbience2]);
    expect(record.ambienceStops).toBe(1);
    expect(record.decals).toEqual([DECAL]);
    expect(record.scores.map((score) => score.points)).toEqual([100]);
    expect(record.frames).toHaveLength(2);
  });

  it('feeds the number of playing ambience samples back into the tick input', () => {
    const { session, record } = startSession();
    record.ambience = 2;
    session.tick();
    expect(record.extras.at(-1)).toEqual({ quitRequested: false, ambienceSamplesPlaying: 2 });
  });

  it('toggles the upgrade list with the key while the world keeps running', () => {
    const { session, record } = startSession();
    expect(record.upgradeLists.at(-1)).toBeUndefined();
    const tick = session.world.tick;
    const rendered = record.frames.length;
    record.upgradeKeyPresses.push(true);
    session.tick();
    session.tick();
    expect(session.upgradeListShown).toBe(true);
    expect(record.upgradeLists.at(-1)?.length).toBeGreaterThan(50);
    expect(session.world.tick).toBe(tick + 2);
    expect(record.frames).toHaveLength(rendered + 2);
    record.upgradeKeyPresses.push(true);
    session.tick();
    expect(session.upgradeListShown).toBe(false);
    expect(record.upgradeLists.at(-1)).toBeUndefined();
    expect(session.world.tick).toBe(tick + 3);
  });

  it('completes once on quit and ignores later ticks', () => {
    const { session, record } = startSession();
    session.requestQuit();
    session.tick();
    session.tick();
    expect(record.results).toEqual([{ state: CompletionState.Quit, score: 0 }]);
    expect(session.completed).toBe(true);
    expect(record.ambienceStops).toBe(1);
  });

  it('renders one camera for the only local player', () => {
    const { record } = startSession(GameMode.Single);
    expect(record.frames[0]?.cameras.map((camera) => camera.view.playerIndex)).toEqual([0]);
    expect(record.frames[0]?.localPlayerIndex).toBe(0);
    expect(record.frames[0]?.hud.frags).toHaveLength(MAX_PLAYERS);
  });
});
