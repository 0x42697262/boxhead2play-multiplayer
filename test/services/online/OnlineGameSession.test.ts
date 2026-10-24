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
import { MAX_BUFFERED_FRAMES } from '../../../src/services/online/tuning.ts';
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

function harness(showPing = true, latencyMs: () => number | undefined = () => 87) {
  let pings = 0;
  const rendered: WorldFrame[] = [];
  const sounds: SoundId[] = [];
  const decals: unknown[] = [];
  const lists: (readonly MultiplierListEntry[] | undefined)[] = [];
  const sent: ControlMasks[] = [];
  const results: OnlineSessionResult[] = [];
  const controls: SampledControls[] = [];
  let leaves = 0;
  let sink: GameSink | undefined;
  const session = new OnlineGameSession({
    start: START,
    audio: { play: (sound) => sounds.push(sound), stopAmbience: () => undefined, ambiencePlaying: () => 0 },
    scene: { stampDecal: (decal) => decals.push(decal), awardScore: () => undefined, showUpgrades: (list) => lists.push(list), render: (world) => rendered.push(world) },
    input: { sample: () => controls.shift() ?? { masks: IDLE_MASKS, upgradeListPressed: false } },
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
      ping: () => pings++,
      latencyMs,
    },
    playerNames: () => ({ 1: 'Bob' }),
    showPing: () => showPing,
    logger: silentLogger,
    onFinished: (result) => results.push(result),
  });
  return { session, rendered, sounds, decals, lists, sent, results, controls, leaves: () => leaves, sink: () => sink, pings: () => pings };
}

describe('OnlineGameSession latency', () => {
  it('pings once per second of ticks, starting with the first tick', () => {
    const { session, pings } = harness();
    for (let tick = 0; tick < START.ticksPerSecond * 2 + 1; tick++) session.tick();
    expect(pings()).toBe(3);
  });

  it('puts the latency into the HUD only when the ping display is on and a value exists', () => {
    const shown = harness();
    shown.session.frame(frame(1));
    shown.session.tick();
    expect(shown.rendered[0]?.hud.latencyMs).toBe(87);
    const hidden = harness(false);
    hidden.session.frame(frame(1));
    hidden.session.tick();
    expect(hidden.rendered[0]?.hud).not.toHaveProperty('latencyMs');
    const unknown = harness(true, () => undefined);
    unknown.session.frame(frame(1));
    unknown.session.tick();
    expect(unknown.rendered[0]?.hud).not.toHaveProperty('latencyMs');
  });
});

describe('OnlineGameSession playback', () => {
  it('plays a frame on the first tick after it arrives, as the local player', () => {
    const { session, rendered } = harness();
    session.tick();
    expect(rendered).toHaveLength(0);
    session.frame(frame(1));
    session.tick();
    session.frame(frame(2));
    session.tick();
    expect(rendered.map((world) => world.tick)).toEqual([1, 2]);
    expect(rendered[0]).toMatchObject({ localPlayerIndex: 1, gameMode: START.mode, projectionFactor: -0.5, ticksPerSecond: 25 });
    expect(rendered[0]?.hud.playerNames).toEqual({ 1: 'Bob' });
  });

  it('drops frames beyond the buffer limit with their decals only, and catches up one more with its sounds', () => {
    const { session, rendered, decals, sounds } = harness();
    const total = MAX_BUFFERED_FRAMES + 3;
    for (let tick = 1; tick <= total; tick++) session.frame(frame(tick, { events: [DECAL, SOUND] }));
    session.tick();
    const live = total - MAX_BUFFERED_FRAMES + 2;
    expect(rendered.map((world) => world.tick)).toEqual([live]);
    expect(decals).toHaveLength(live);
    expect(sounds).toHaveLength(2);
  });

  it('toggles the upgrade list with the key while input and playback keep running', () => {
    const { session, rendered, lists, sent, controls } = harness();
    const upgrades = [{ index: 1, name: 'upgrade.uzi' as never, active: true, newWeapon: true }];
    session.upgrades(upgrades);
    controls.push({ masks: { down: 4, pressed: 4, released: 0 }, upgradeListPressed: true }, { masks: { down: 4, pressed: 0, released: 0 }, upgradeListPressed: false });
    session.pollInput();
    session.pollInput();
    expect(session.upgradeListShown).toBe(true);
    expect(lists).toEqual([upgrades]);
    expect(sent).toEqual([{ down: 4, pressed: 4, released: 0 }]);
    session.frame(frame(1));
    session.tick();
    expect(rendered).toHaveLength(1);
    const updated = [{ ...upgrades[0], active: false }] as typeof upgrades;
    session.upgrades(updated);
    expect(lists.at(-1)).toEqual(updated);
    controls.push({ masks: { down: 4, pressed: 0, released: 0 }, upgradeListPressed: true });
    session.pollInput();
    expect(session.upgradeListShown).toBe(false);
    expect(lists.at(-1)).toBeUndefined();
  });

  it('releases held controls when the page is hidden', () => {
    const { session, sent, controls } = harness();
    controls.push({ masks: { down: 4, pressed: 4, released: 0 }, upgradeListPressed: false });
    session.pollInput();
    session.releaseControls();
    expect(sent).toEqual([{ down: 4, pressed: 4, released: 0 }, { down: 0, pressed: 0, released: 4 }]);
  });

  it('sends input only when the held set changes or an edge happened', () => {
    const { session, sent, controls } = harness();
    controls.push(
      { masks: { down: 1, pressed: 1, released: 0 }, upgradeListPressed: false },
      { masks: { down: 1, pressed: 0, released: 0 }, upgradeListPressed: false },
      { masks: { down: 0, pressed: 0, released: 1 }, upgradeListPressed: false },
      { masks: IDLE_MASKS, upgradeListPressed: false },
    );
    for (let poll = 0; poll < 4; poll++) session.pollInput();
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
