import { DomainEventType, type EventSink, type MessageTone, type Point2, type Point3, type TextRef } from '../events.ts';
import { MAX_PLAYERS } from '../world/tuning.ts';
import { MESSAGE_LIFETIME_SECONDS } from './tuning.ts';

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

export interface PlayerDeath {
  readonly victim: number;
  readonly killer: number | undefined;
  readonly opponents: readonly number[];
}

function perPlayer(): number[] {
  return Array.from({ length: MAX_PLAYERS }, () => 0);
}

export class HudState {
  totalScore = 0;
  silentMessages = false;
  paused = false;
  private readonly deaths = perPlayer();
  private readonly kills = perPlayer();
  private recent: HudMessageEntry[] = [];

  constructor(
    private readonly events: EventSink,
    private readonly clock: HudClock,
  ) {}

  get messages(): readonly HudMessageEntry[] {
    return this.recent;
  }

  get frags(): readonly number[] {
    return this.kills;
  }

  deathsOf(playerIndex: number): number {
    return this.deaths[playerIndex] ?? 0;
  }

  fragsOf(playerIndex: number): number {
    return this.kills[playerIndex] ?? 0;
  }

  recordDeath(death: PlayerDeath): void {
    this.deaths[death.victim] = this.deathsOf(death.victim) + 1;
    const credited = death.killer !== undefined && death.killer !== death.victim ? [death.killer] : death.opponents;
    for (const index of credited) this.kills[index] = this.fragsOf(index) + 1;
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
