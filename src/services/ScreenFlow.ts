import { GameMode } from '../domain/world/GameMode.ts';
import type { GameStarted, OnlineMode } from '../net/protocol.ts';
import type { Logger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';
import type { SessionResult } from './GameSession.ts';
import type { OnlineSessionResult } from './online/OnlineGameSession.ts';

export interface StagePoint {
  readonly x: number;
  readonly y: number;
}

export const PointerPhase = {
  Down: 'down',
  Up: 'up',
  Move: 'move',
  Leave: 'leave',
} as const;

export type PointerPhase = (typeof PointerPhase)[keyof typeof PointerPhase];

export interface PointerInput {
  readonly phase: PointerPhase;
  readonly point: StagePoint;
}

export const Cursor = {
  Default: 'default',
  Hand: 'pointer',
} as const;

export type Cursor = (typeof Cursor)[keyof typeof Cursor];

export interface Screen {
  readonly name: string;
  readonly ticksPerSecond: number;
  readonly cursor: Cursor;
  tick(): void;
  present(): void;
  idle(hasTime: () => boolean): void;
  pointer(input: PointerInput): void;
  key(code: string): boolean;
  suspend(): void;
  dispose(): void;
}

export interface GameSelection {
  readonly mode: GameMode;
  readonly roomId: string;
}

export interface LobbyEntry {
  readonly mode: OnlineMode;
  readonly host: GameSelection | undefined;
  readonly result: OnlineSessionResult | undefined;
}

export interface FlowControls {
  showMainMenu(): void;
  selectWorld(mode: GameMode): void;
  startGame(selection: GameSelection): void;
  finishGame(result: SessionResult): void;
  openLobby(mode: OnlineMode): void;
  hostLobby(selection: GameSelection): void;
  startOnlineGame(start: GameStarted): void;
  finishOnlineGame(result: OnlineSessionResult): void;
}

export interface ScreenFactory {
  mainMenu(controls: FlowControls): Screen;
  selectWorld(controls: FlowControls, mode: GameMode): Screen;
  game(controls: FlowControls, selection: GameSelection): Screen;
  lobby(controls: FlowControls, entry: LobbyEntry): Screen;
  onlineGame(controls: FlowControls, start: GameStarted): Screen;
}

export const ScreenKind = {
  MainMenu: 'mainMenu',
  SelectWorld: 'selectWorld',
  Game: 'game',
  Lobby: 'lobby',
  OnlineGame: 'onlineGame',
} as const;

export type ScreenKind = (typeof ScreenKind)[keyof typeof ScreenKind];

export type Transition =
  | { readonly kind: typeof ScreenKind.MainMenu }
  | { readonly kind: typeof ScreenKind.SelectWorld; readonly mode: GameMode }
  | { readonly kind: typeof ScreenKind.Game; readonly selection: GameSelection }
  | { readonly kind: typeof ScreenKind.Lobby; readonly entry: LobbyEntry }
  | { readonly kind: typeof ScreenKind.OnlineGame; readonly start: GameStarted };

export const DEFAULT_RETURN_MODE: GameMode = GameMode.Single;
const IDLE_TICKS_PER_SECOND = 1;

export class ScreenFlow implements FlowControls {
  private current: Screen | undefined = undefined;
  private pending: Transition | undefined = undefined;
  private changes = 0;
  private returnMode: GameMode = DEFAULT_RETURN_MODE;
  private lastPointer: StagePoint | undefined = undefined;
  private shownCursor: Cursor = Cursor.Default;

  constructor(
    private readonly factory: ScreenFactory,
    private readonly logger: Logger,
    private readonly onCursor: (cursor: Cursor) => void = () => undefined,
  ) {}

  get screen(): Screen | undefined {
    return this.current;
  }

  get version(): number {
    return this.changes;
  }

  get ticksPerSecond(): number {
    return this.current?.ticksPerSecond ?? IDLE_TICKS_PER_SECOND;
  }

  get selectWorldMode(): GameMode {
    return this.returnMode;
  }

  start(): void {
    this.show(this.factory.mainMenu(this));
  }

  showMainMenu(): void {
    this.pending = { kind: ScreenKind.MainMenu };
  }

  selectWorld(mode: GameMode): void {
    this.pending = { kind: ScreenKind.SelectWorld, mode };
  }

  startGame(selection: GameSelection): void {
    this.pending = { kind: ScreenKind.Game, selection };
  }

  finishGame(result: SessionResult): void {
    this.logger.info(LogEvent.GameFinished, { state: result.state, score: result.score, mode: this.returnMode });
    this.pending = { kind: ScreenKind.SelectWorld, mode: this.returnMode };
  }

  openLobby(mode: OnlineMode): void {
    this.pending = { kind: ScreenKind.Lobby, entry: { mode, host: undefined, result: undefined } };
  }

  hostLobby(selection: GameSelection): void {
    if (selection.mode === GameMode.Single) return;
    this.pending = { kind: ScreenKind.Lobby, entry: { mode: selection.mode, host: selection, result: undefined } };
  }

  startOnlineGame(start: GameStarted): void {
    this.pending = { kind: ScreenKind.OnlineGame, start };
  }

  finishOnlineGame(result: OnlineSessionResult): void {
    const mode = this.returnMode === GameMode.Single ? undefined : this.returnMode;
    this.logger.info(LogEvent.GameFinished, { state: result.state, end: result.end, mode: this.returnMode });
    if (mode) this.pending = { kind: ScreenKind.Lobby, entry: { mode, host: undefined, result } };
    else this.pending = { kind: ScreenKind.MainMenu };
  }

  tick(): void {
    this.current?.tick();
    this.applyPending();
  }

  present(): void {
    this.applyPending();
    this.current?.present();
    this.syncCursor();
  }

  idle(hasTime: () => boolean): void {
    this.current?.idle(hasTime);
  }

  pointer(input: PointerInput): void {
    this.lastPointer = input.phase === PointerPhase.Leave ? undefined : input.point;
    this.current?.pointer(input);
    this.syncCursor();
  }

  key(code: string): boolean {
    return this.current?.key(code) ?? false;
  }

  suspend(): void {
    this.current?.suspend();
  }

  private applyPending(): void {
    const transition = this.pending;
    if (!transition) return;
    this.pending = undefined;
    switch (transition.kind) {
      case ScreenKind.MainMenu:
        this.show(this.factory.mainMenu(this));
        return;
      case ScreenKind.SelectWorld:
        this.returnMode = transition.mode;
        this.show(this.factory.selectWorld(this, transition.mode));
        return;
      case ScreenKind.Game:
        this.returnMode = transition.selection.mode;
        try {
          this.show(this.factory.game(this, transition.selection));
        } catch (error) {
          this.logger.error(LogEvent.WorldFailed, { room: transition.selection.roomId, error: String(error) });
          this.show(this.factory.selectWorld(this, transition.selection.mode));
        }
        return;
      case ScreenKind.Lobby:
        this.returnMode = transition.entry.mode;
        this.show(this.factory.lobby(this, transition.entry));
        return;
      case ScreenKind.OnlineGame:
        this.returnMode = transition.start.mode;
        try {
          this.show(this.factory.onlineGame(this, transition.start));
        } catch (error) {
          this.logger.error(LogEvent.WorldFailed, { room: transition.start.roomId, error: String(error) });
          this.show(this.factory.lobby(this, { mode: transition.start.mode, host: undefined, result: undefined }));
        }
    }
  }

  private show(screen: Screen): void {
    this.current?.dispose();
    this.current = screen;
    this.changes++;
    this.logger.info(LogEvent.ScreenChanged, { screen: screen.name });
    if (this.lastPointer) screen.pointer({ phase: PointerPhase.Move, point: this.lastPointer });
    this.syncCursor();
  }

  private syncCursor(): void {
    const cursor = this.current?.cursor ?? Cursor.Default;
    if (cursor === this.shownCursor) return;
    this.shownCursor = cursor;
    this.onCursor(cursor);
  }
}
