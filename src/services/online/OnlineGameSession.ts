import type { HudFrame, WorldFrame } from '../../adapters/render/world/WorldFrame.ts';
import { DomainEventType } from '../../domain/events.ts';
import type { MultiplierListEntry } from '../../domain/upgrades/Upgrades.ts';
import { CharacterStyle, VisualKind, type DrawEntry } from '../../domain/visuals.ts';
import { INITIAL_AMBIENCE, stepAmbience, type AmbienceState } from '../../domain/world/ambience.ts';
import { CompletionState } from '../../domain/world/CompletionState.ts';
import { IDLE_MASKS, sameMasks, type ControlMasks } from '../../net/controlMask.ts';
import type { GameOver, GameStarted, NetFrame } from '../../net/protocol.ts';
import type { Logger } from '../../observability/logger.ts';
import { LogEvent } from '../../text/logEvents.ts';
import type { SessionAudio, SessionScene } from '../GameSession.ts';
import type { GameSink } from './OnlineClient.ts';
import { FrameBuffer, FrameUse } from './FrameBuffer.ts';

export interface SampledControls {
  readonly masks: ControlMasks;
  readonly upgradeListPressed: boolean;
}

export interface OnlineInput {
  sample(): SampledControls;
}

export interface OnlineLink {
  input(masks: ControlMasks): boolean;
  leaveGame(): void;
  attachGame(sink: GameSink): () => void;
}

export const OnlineEnd = {
  Finished: 'finished',
  Quit: 'quit',
  Lost: 'lost',
} as const;

export type OnlineEnd = (typeof OnlineEnd)[keyof typeof OnlineEnd];

export interface OnlineSessionResult {
  readonly end: OnlineEnd;
  readonly state: CompletionState;
  readonly gameOver: GameOver | undefined;
}

export interface OnlineSessionDependencies {
  readonly start: GameStarted;
  readonly audio: SessionAudio;
  readonly scene: SessionScene;
  readonly input: OnlineInput;
  readonly link: OnlineLink;
  readonly playerNames: () => HudFrame['playerNames'];
  readonly logger: Logger;
  readonly onFinished: (result: OnlineSessionResult) => void;
}

export function visibleZombies(entries: readonly DrawEntry[]): number {
  return entries.filter((entry) => entry.visual.kind === VisualKind.Character && entry.visual.style === CharacterStyle.Zombie).length;
}

export function releasedMasks(previous: ControlMasks): ControlMasks {
  return { down: 0, pressed: 0, released: previous.down };
}

export class OnlineGameSession implements GameSink {
  readonly matchId: string;
  private readonly buffer = new FrameBuffer<NetFrame>();
  private readonly detach: () => void;
  private upgradesShown = false;
  private finished = false;
  private upgradeList: readonly MultiplierListEntry[] = [];
  private ambience: AmbienceState = INITIAL_AMBIENCE;
  private sent: ControlMasks = IDLE_MASKS;

  constructor(private readonly deps: OnlineSessionDependencies) {
    this.matchId = deps.start.matchId;
    this.detach = deps.link.attachGame(this);
    deps.logger.info(LogEvent.WorldStarted, { room: deps.start.roomId, mode: deps.start.mode, match: deps.start.matchId, online: true });
  }

  get ticksPerSecond(): number {
    return this.deps.start.ticksPerSecond;
  }

  get bufferedFrames(): number {
    return this.buffer.length;
  }

  get upgradeListShown(): boolean {
    return this.upgradesShown;
  }

  get completed(): boolean {
    return this.finished;
  }

  frame(frame: NetFrame): void {
    if (!this.finished) this.buffer.push(frame);
  }

  upgrades(upgrades: readonly MultiplierListEntry[]): void {
    this.upgradeList = upgrades;
    if (this.upgradesShown) this.deps.scene.showUpgrades(upgrades);
  }

  gameOver(result: GameOver): void {
    this.finish({ end: OnlineEnd.Finished, state: result.state, gameOver: result });
  }

  lost(): void {
    this.finish({ end: OnlineEnd.Lost, state: CompletionState.Error, gameOver: undefined });
  }

  tick(): void {
    if (this.finished) return;
    for (const { frame, use } of this.buffer.next()) this.apply(frame, use);
  }

  pollInput(): void {
    if (this.finished) return;
    const sampled = this.deps.input.sample();
    if (sampled.upgradeListPressed) this.toggleUpgradeList();
    const { masks } = sampled;
    if (sameMasks(masks, this.sent) && masks.pressed === 0 && masks.released === 0) return;
    if (this.deps.link.input(masks)) this.sent = { down: masks.down, pressed: 0, released: 0 };
  }

  requestQuit(): void {
    if (this.finished) return;
    this.deps.link.leaveGame();
    this.finish({ end: OnlineEnd.Quit, state: CompletionState.Quit, gameOver: undefined });
  }

  releaseControls(): void {
    if (this.finished) return;
    if (this.deps.link.input(releasedMasks(this.sent))) this.sent = IDLE_MASKS;
  }

  dispose(): void {
    this.detach();
  }

  private toggleUpgradeList(): void {
    this.upgradesShown = !this.upgradesShown;
    this.deps.scene.showUpgrades(this.upgradesShown ? this.upgradeList : undefined);
  }

  private apply(frame: NetFrame, use: FrameUse): void {
    const audible = use !== FrameUse.Dropped;
    for (const event of frame.events) {
      switch (event.type) {
        case DomainEventType.DecalRequested:
          this.deps.scene.stampDecal(event);
          break;
        case DomainEventType.SoundRequested:
          if (audible) this.deps.audio.play(event.sound);
          break;
        case DomainEventType.ScoreAwarded:
          if (audible) this.deps.scene.awardScore(event);
          break;
      }
    }
    if (use !== FrameUse.Live) return;
    this.stepAmbience(frame);
    this.deps.scene.render(this.worldFrame(frame));
  }

  private stepAmbience(frame: NetFrame): void {
    const step = stepAmbience(this.ambience, visibleZombies(frame.entries), this.deps.audio.ambiencePlaying());
    this.ambience = step.state;
    for (const event of step.events) {
      if (event.type === DomainEventType.AmbienceRequested) this.deps.audio.play(event.sound);
      if (event.type === DomainEventType.AmbienceStopped) this.deps.audio.stopAmbience();
    }
  }

  private worldFrame(frame: NetFrame): WorldFrame {
    const { start } = this.deps;
    return {
      gameMode: start.mode,
      localPlayerIndex: start.playerIndex,
      cameras: [{ view: frame.camera, entries: frame.entries }],
      brightness: frame.brightness,
      projectionFactor: start.projectionFactor,
      tick: frame.tick,
      ticksPerSecond: start.ticksPerSecond,
      hud: { ...frame.hud, localPlayerIndex: start.playerIndex, playerNames: this.deps.playerNames(), upgrades: [] },
    };
  }

  private finish(result: OnlineSessionResult): void {
    if (this.finished) return;
    this.finished = true;
    this.buffer.clear();
    this.deps.audio.stopAmbience();
    this.deps.logger.info(LogEvent.WorldCompleted, { state: result.state, end: result.end, match: this.matchId, online: true });
    this.deps.onFinished(result);
  }
}
