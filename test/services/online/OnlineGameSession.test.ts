import { describe, expect, it } from 'vitest';
import type { WorldFrame } from '../../../src/adapters/render/world/WorldFrame.ts';
import { DecalKind, DomainEventType } from '../../../src/domain/events.ts';
import { SoundId } from '../../../src/domain/sounds.ts';
import type { MultiplierListEntry } from '../../../src/domain/upgrades/Upgrades.ts';
import { CharacterStyle, VisualKind, type DrawEntry } from '../../../src/domain/visuals.ts';
import { CompletionState } from '../../../src/domain/world/CompletionState.ts';
import { IDLE_MASKS, type ControlMasks } from '../../../src/net/controlMask.ts';
import { silentLogger } from '../../../src/observability/logger.ts';
import type { GameSink } from '../../../src/services/online/OnlineClient.ts';
import { OnlineEnd, OnlineGameSession, visibleZombies, type OnlineSessionResult, type SampledControls } from '../../../src/services/online/OnlineGameSession.ts';
import { JITTER_BUFFER_FRAMES, MAX_BUFFERED_FRAMES } from '../../../src/services/online/tuning.ts';
import { frame, START } from './support.ts';

const DECAL = { type: DomainEventType.DecalRequested, decal: DecalKind.BloodSplat, symbol: 's', xPx: 1, yPx: 2, frame: 0, rotationIndex: 0, rotationCount: 1, scaleX: 1, scaleY: 1 } as const;
const SOUND = { type: DomainEventType.SoundRequested, sound: SoundId.PistolFire } as const;

function zombie(key: string): DrawEntry {
  const position = { x: 1, y: 1, z: 0 };
  return {
    thingKey: key,
    sortFloor: false,
    position,
    visual: { kind: VisualKind.Character, layer: 'world', style: CharacterStyle.Zombie, styleScale: 0.35, animation: 'a', direction: 0, directionCount: 8, frame: 0, sourceFrame: 0, alpha: 100, position },
  };
}

function harness() {
  const rendered: WorldFrame[] = [];
  const sounds: SoundId[] = [];
  const decals: unknown[] = [];
  const pauses: (readonly MultiplierListEntry[] | undefined)[] = [];
  const sent: ControlMasks[] = [];
  const results: OnlineSessionResult[] = [];
  const controls: SampledControls[] = [];
  let leaves = 0;
  let sink: GameSink | undefined;
  const session = new OnlineGameSession({
    start: START,
    audio: { play: (sound) => sounds.push(sound), stopAmbience: () => undefined, ambiencePlaying: () => 0 },
    scene: { stampDecal: (decal) => decals.push(decal), awardScore: () => undefined, showPause: (list) => pauses.push(list), render: (world) => rendered.push(world) },
    input: { sample: () => controls.shift() ?? { masks: IDLE_MASKS, pausePressed: false } },
    link: {
      input: (masks) => {
        sent.push(masks);
        return true;
      },
      leaveGame: () => leaves++,
      attachGame: (attached) => {
        sink = attached;
        return () => (sink = undefined);
      },
    },
    playerNames: () => ({ 1: 'Bob' }),
    logger: silentLogger,
    onFinished: (result) => results.push(result),
  });
  return { session, rendered, sounds, decals, pauses, sent, results, controls, leaves: () => leaves, sink: () => sink };
}

describe('OnlineGameSession playback', () => {
  it('waits for the jitter buffer, then plays one frame per tick as the local player', () => {
    const { session, rendered } = harness();
    session.frame(frame(1));
    session.tick();
    expect(rendered).toHaveLength(0);
    for (let tick = 2; tick <= JITTER_BUFFER_FRAMES; tick++) session.frame(frame(tick));
    session.tick();
    session.tick();
    expect(rendered.map((world) => world.tick)).toEqual([1, 2]);
    expect(rendered[0]).toMatchObject({ localPlayerIndex: 1, gameMode: START.mode, projectionFactor: -0.5, ticksPerSecond: 25 });
    expect(rendered[0]?.hud.playerNames).toEqual({ 1: 'Bob' });
  });

  it('drops stale frames beyond the buffer limit but still stamps their decals', () => {
    const { session, rendered, decals, sounds } = harness();
    const total = MAX_BUFFERED_FRAMES + 3;
    for (let tick = 1; tick <= total; tick++) session.frame(frame(tick, { events: [DECAL, SOUND] }));
    session.tick();
    expect(rendered.map((world) => world.tick)).toEqual([total - MAX_BUFFERED_FRAMES + 1]);
    expect(decals).toHaveLength(total - MAX_BUFFERED_FRAMES + 1);
    expect(sounds).toHaveLength(1);
  });

  it('pauses locally: idle input, the pause screen with the upgrade list, decals but no rendering', () => {
    const { session, rendered, decals, pauses, sent, controls } = harness();
    const upgrades = [{ index: 1, name: 'upgrade.uzi' as never, active: true, newWeapon: true }];
    session.upgrades(upgrades);
    controls.push({ masks: { down: 4, pressed: 4, released: 0 }, pausePressed: false }, { masks: { down: 4, pressed: 0, released: 0 }, pausePressed: true });
    for (let tick = 1; tick <= 4; tick++) session.frame(frame(tick, { events: [DECAL] }));
    session.tick();
    session.tick();
    expect(session.isPaused).toBe(true);
    expect(pauses).toEqual([upgrades]);
    expect(sent).toEqual([{ down: 4, pressed: 4, released: 0 }, { down: 0, pressed: 0, released: 4 }]);
    session.tick();
    expect(rendered).toHaveLength(1);
    expect(decals).toHaveLength(3);
  });

  it('sends input only when the held set changes or an edge happened', () => {
    const { session, sent, controls } = harness();
    controls.push(
      { masks: { down: 1, pressed: 1, released: 0 }, pausePressed: false },
      { masks: { down: 1, pressed: 0, released: 0 }, pausePressed: false },
      { masks: { down: 0, pressed: 0, released: 1 }, pausePressed: false },
      { masks: IDLE_MASKS, pausePressed: false },
    );
    for (let tick = 0; tick < 4; tick++) session.tick();
    expect(sent).toEqual([{ down: 1, pressed: 1, released: 0 }, { down: 0, pressed: 0, released: 1 }]);
  });

  it('counts visible zombies from character visuals for the local ambience', () => {
    expect(visibleZombies([zombie('a'), zombie('b')])).toBe(2);
  });
});

describe('OnlineGameSession endings', () => {
  it('finishes once on game over, quit or a lost session', () => {
    const over = harness();
    over.sink()?.gameOver({ type: 'gameOver', matchId: 'm1', state: CompletionState.PlayerWon, winnerName: 'Bob', score: 0 });
    over.session.requestQuit();
    expect(over.results.map((result) => result.end)).toEqual([OnlineEnd.Finished]);
    expect(over.leaves()).toBe(0);

    const quit = harness();
    quit.session.requestQuit();
    expect(quit.results).toEqual([{ end: OnlineEnd.Quit, state: CompletionState.Quit, gameOver: undefined }]);
    expect(quit.leaves()).toBe(1);

    const lost = harness();
    lost.sink()?.lost();
    expect(lost.results[0]?.end).toBe(OnlineEnd.Lost);
    lost.session.dispose();
    expect(lost.sink()).toBeUndefined();
  });
});
