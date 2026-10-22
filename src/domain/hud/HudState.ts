import { DomainEventType, type EventSink, type MessageTone, type Point2, type Point3, type TextRef } from '../events.ts';

import { MAX_PLAYERS, MESSAGE_LIFETIME_SECONDS } from './tuning.ts';

export interface HudMessageEntry {
  readonly tone: MessageTone;
  readonly text: TextRef;
  readonly tick: number;
  readonly playerIndex?: number;
}

export interface HudClock {
  readonly tick: number;
  readonly ticksPerSecond: number;
}

export class HudState {
  totalScore = 0;
  silentMessages = false;
  paused = false;
  private readonly deaths: number[] = Array.from({ length: MAX_PLAYERS }, () => 0);
  private recent: HudMessageEntry[] = [];

  constructor(
    private readonly events: EventSink,
    private readonly clock: HudClock,
  ) {}

  get messages(): readonly HudMessageEntry[] {
    return this.recent;
  }

  deathsOf(playerIndex: number): number {
    return this.deaths[playerIndex] ?? 0;
  }

  recordDeath(playerIndex: number): void {
    this.deaths[playerIndex] = this.deathsOf(playerIndex) + 1;
  }

  addMessage(tone: MessageTone, text: TextRef, playerIndex?: number): void {
    if (this.silentMessages) return;
    const base = { tone, text, tick: this.clock.tick };
    this.recent.push(playerIndex === undefined ? base : { ...base, playerIndex });
    this.events.emit(
      playerIndex === undefined
        ? { type: DomainEventType.HudMessage, tone, text }
        : { type: DomainEventType.HudMessage, tone, text, playerIndex },
    );
  }

  addScore(points: number, worldPosition: Point3, screenPosition: Point2, showPopup: boolean): void {
    this.totalScore += points;
    if (!showPopup) return;
    this.events.emit({ type: DomainEventType.ScoreAwarded, points, worldPosition, screenPosition });
  }

  pruneMessages(): void {
    const oldest = this.clock.tick - MESSAGE_LIFETIME_SECONDS * this.clock.ticksPerSecond;
    this.recent = this.recent.filter((message) => message.tick > oldest);
  }
}
