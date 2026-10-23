import type { GameMode } from '../domain/world/GameMode.ts';
import { BASE_TICKS_PER_SECOND } from '../domain/world/tuning.ts';
import type { Logger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';
import type { SessionResult } from './GameSession.ts';

export interface StagePoint {
  readonly x: number;
  readonly y: number;
}

export interface Screen {
  readonly name: string;
  readonly ticksPerSecond: number;
  tick(): void;
  present(): void;
  idle(hasTime: () => boolean): void;
  pointer(point: StagePoint): void;
  suspend(): void;
  dispose(): void;
}

export interface GameSelection {
  readonly mode: GameMode;
  readonly roomId: string;
}

export interface FlowControls {
  startGame(selection: GameSelection): void;
  finishGame(result: SessionResult): void;
}

export interface ScreenFactory {
  picker(controls: FlowControls, lastResult: SessionResult | undefined): Screen;
  game(controls: FlowControls, selection: GameSelection): Screen;
}

export const MENU_TICKS_PER_SECOND = BASE_TICKS_PER_SECOND;

type Transition = { readonly kind: 'game'; readonly selection: GameSelection } | { readonly kind: 'picker'; readonly result: SessionResult | undefined };

export class ScreenFlow implements FlowControls {
  private current: Screen | undefined = undefined;
  private pending: Transition | undefined = undefined;
  private changes = 0;

  constructor(
    private readonly factory: ScreenFactory,
    private readonly logger: Logger,
  ) {}

  get screen(): Screen | undefined {
    return this.current;
  }

  get version(): number {
    return this.changes;
  }

  get ticksPerSecond(): number {
    return this.current?.ticksPerSecond ?? MENU_TICKS_PER_SECOND;
  }

  start(): void {
    this.show(this.factory.picker(this, undefined));
  }

  startGame(selection: GameSelection): void {
    this.pending = { kind: 'game', selection };
  }

  finishGame(result: SessionResult): void {
    this.pending = { kind: 'picker', result };
  }

  tick(): void {
    this.current?.tick();
    this.applyPending();
  }

  present(): void {
    this.applyPending();
    this.current?.present();
  }

  idle(hasTime: () => boolean): void {
    this.current?.idle(hasTime);
  }

  pointer(point: StagePoint): void {
    this.current?.pointer(point);
  }

  suspend(): void {
    this.current?.suspend();
  }

  private applyPending(): void {
    const transition = this.pending;
    if (!transition) return;
    this.pending = undefined;
    if (transition.kind === 'picker') {
      this.show(this.factory.picker(this, transition.result));
      return;
    }
    try {
      this.show(this.factory.game(this, transition.selection));
    } catch (error) {
      this.logger.error(LogEvent.WorldFailed, { room: transition.selection.roomId, error: String(error) });
      this.show(this.factory.picker(this, undefined));
    }
  }

  private show(screen: Screen): void {
    this.current?.dispose();
    this.current = screen;
    this.changes++;
    this.logger.info(LogEvent.ScreenChanged, { screen: screen.name });
  }
}
