import type { SampledTick, SampleExtras } from '../adapters/input/TickInputSampler.ts';
import type { HudFrame, WorldFrame } from '../adapters/render/world/WorldFrame.ts';
import type { AnimationCatalog } from '../domain/animation/AnimationCatalog.ts';
import { DomainEventType, type DecalRequested, type DomainEvent, type ScoreAwarded } from '../domain/events.ts';
import type { Rng } from '../domain/math/Rng.ts';
import type { SoundId } from '../domain/sounds.ts';
import type { ThingFactory } from '../domain/things/ThingFactory.ts';
import type { MultiplierListEntry } from '../domain/upgrades/Upgrades.ts';
import type { CompletionState } from '../domain/world/CompletionState.ts';
import type { RoomDefinition } from '../domain/world/RoomDefinition.ts';
import { createSimulationSettings, type GameOptions } from '../domain/world/SimulationSettings.ts';
import { World } from '../domain/world/World.ts';
import { playerHudEntries } from '../net/frames.ts';
import type { Logger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';

export interface SessionAudio {
  play(sound: SoundId): void;
  stopAmbience(): void;
  ambiencePlaying(): number;
}

export interface SessionScene {
  stampDecal(event: DecalRequested): void;
  awardScore(event: ScoreAwarded): void;
  showUpgrades(upgrades: readonly MultiplierListEntry[] | undefined): void;
  render(frame: WorldFrame): void;
}

export interface SessionInput {
  sample(extras: SampleExtras): SampledTick;
}

export interface SessionResult {
  readonly state: CompletionState;
  readonly score: number;
}

export interface GameSessionDependencies {
  readonly room: RoomDefinition;
  readonly options: GameOptions;
  readonly rng: Rng;
  readonly factory: ThingFactory;
  readonly animations: AnimationCatalog;
  readonly audio: SessionAudio;
  readonly scene: SessionScene;
  readonly input: SessionInput;
  readonly logger: Logger;
  readonly onCompleted: (result: SessionResult) => void;
}

export const LOCAL_PLAYER_INDEX = 0;

export function hudFrame(world: World, localPlayerIndex: number = LOCAL_PLAYER_INDEX, playerNames: HudFrame['playerNames'] = {}): HudFrame {
  return {
    localPlayerIndex,
    playerNames,
    totalScore: world.hud.totalScore,
    multiplier: world.upgrades.multiplier,
    multiplierTickRatio: world.upgrades.multiplierTickRatio,
    frags: world.hud.frags,
    messages: world.hud.messages,
    players: playerHudEntries(world),
    upgrades: [],
  };
}

export function worldFrame(world: World): WorldFrame {
  const presentation = world.presentation;
  return {
    gameMode: world.settings.gameMode,
    localPlayerIndex: LOCAL_PLAYER_INDEX,
    cameras: presentation.cameras.map((view) => ({ view, entries: world.drawList(view) })),
    brightness: presentation.brightness,
    projectionFactor: world.projectionFactor,
    tick: world.tick,
    ticksPerSecond: world.ticksPerSecond,
    hud: hudFrame(world),
  };
}

export class GameSession {
  private quitRequested = false;
  private finished = false;
  private upgradesShown = false;

  private constructor(
    readonly world: World,
    private readonly deps: GameSessionDependencies,
  ) {}

  static start(deps: GameSessionDependencies): GameSession {
    const settings = createSimulationSettings(deps.options);
    const world = World.create(deps.room, settings, { rng: deps.rng, factory: deps.factory, animations: deps.animations });
    const session = new GameSession(world, deps);
    deps.logger.info(LogEvent.WorldStarted, { room: deps.room.id, mode: settings.gameMode });
    session.route(world.events.drain());
    session.render();
    return session;
  }

  get ticksPerSecond(): number {
    return this.world.ticksPerSecond;
  }

  get completed(): boolean {
    return this.finished;
  }

  get upgradeListShown(): boolean {
    return this.upgradesShown;
  }

  tick(): void {
    if (this.finished) return;
    const sampled = this.deps.input.sample({ quitRequested: this.quitRequested, ambienceSamplesPlaying: this.deps.audio.ambiencePlaying() });
    if (sampled.upgradeListPressed) this.upgradesShown = !this.upgradesShown;
    this.world.update(sampled.tick);
    this.route(this.world.events.drain());
    if (!this.finished) this.render();
  }

  requestQuit(): void {
    this.quitRequested = true;
  }

  private render(): void {
    this.deps.scene.showUpgrades(this.upgradesShown ? this.world.upgrades.multiplierList() : undefined);
    this.deps.scene.render(worldFrame(this.world));
  }

  private route(events: readonly DomainEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case DomainEventType.SoundRequested:
        case DomainEventType.AmbienceRequested:
          this.deps.audio.play(event.sound);
          break;
        case DomainEventType.AmbienceStopped:
          this.deps.audio.stopAmbience();
          break;
        case DomainEventType.DecalRequested:
          this.deps.scene.stampDecal(event);
          break;
        case DomainEventType.ScoreAwarded:
          this.deps.scene.awardScore(event);
          break;
        case DomainEventType.WorldCompleted:
          this.complete(event.state);
          break;
        case DomainEventType.CameraShaken:
        case DomainEventType.BrightnessFlashed:
        case DomainEventType.HudMessage:
          break;
      }
    }
  }

  private complete(state: CompletionState): void {
    if (this.finished) return;
    this.finished = true;
    this.deps.audio.stopAmbience();
    const score = this.world.hud.totalScore;
    this.deps.logger.info(LogEvent.WorldCompleted, { state, score, ticks: this.world.tick });
    this.deps.onCompleted({ state, score });
  }
}
