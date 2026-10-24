import { CompletionState } from '../domain/world/CompletionState.ts';
import { GameMode } from '../domain/world/GameMode.ts';
import type { GameStarted, OnlineMode } from '../net/protocol.ts';
import type { Logger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';
import type { SessionResult } from './GameSession.ts';
import { OnlineEnd, type OnlineSessionResult } from './online/OnlineGameSession.ts';

export interface StagePoint {
  readonly x: number;
  readonly y: number;
}

export const TouchLayout = {
  Hidden: 'hidden',
  Play: 'play',
  Menu: 'menu',
} as const;

export type TouchLayout = (typeof TouchLayout)[keyof typeof TouchLayout];

export const TextEntryKind = {
  Name: 'name',
  Code: 'code',
} as const;

export type TextEntryKind = (typeof TextEntryKind)[keyof typeof TextEntryKind];

export interface TextEntry {
  readonly kind: TextEntryKind;
  readonly draft: string;
  readonly maxLength: number;
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
  readonly touchLayout?: TouchLayout;
  readonly textEntry?: TextEntry | undefined;
  tick(): void;
  present(): void;
  idle(hasTime: () => boolean): void;
  pointer(input: PointerInput): void;
  key(code: string, typed?: string): boolean;
  suspend(): void;
  dispose(): void;
}

export interface GameSelection {
  readonly mode: GameMode;
  readonly roomId: string;
}

export interface LobbyEntry {
  readonly mode: OnlineMode;
  readonly result: OnlineSessionResult | undefined;
  readonly joinCode?: string;
}

export interface FlowControls {
  showMainMenu(): void;
  selectWorld(mode: GameMode): void;
  startGame(selection: GameSelection): void;
  finishGame(result: SessionResult): void;
  openLobby(mode: OnlineMode, result?: OnlineSessionResult): void;
  enterLobby(mode: OnlineMode, result?: OnlineSessionResult): void;
  joinByCode(code: string): void;
  startOnlineGame(start: GameStarted): void;
  finishOnlineGame(result: OnlineSessionResult, inLobby: boolean): void;
}

export interface ScreenFactory {
  mainMenu(controls: FlowControls): Screen;
  selectWorld(controls: FlowControls, mode: GameMode): Screen;
  game(controls: FlowControls, selection: GameSelection): Screen;
  onlineMenu(controls: FlowControls, entry: LobbyEntry): Screen;
  lobbyRoom(controls: FlowControls, entry: LobbyEntry): Screen;
  onlineGame(controls: FlowControls, start: GameStarted): Screen;
}

export const ScreenKind = {
  MainMenu: 'mainMenu',
  SelectWorld: 'selectWorld',
  Game: 'game',
  OnlineMenu: 'onlineMenu',
  LobbyRoom: 'lobbyRoom',
  OnlineGame: 'onlineGame',
} as const;

export type ScreenKind = (typeof ScreenKind)[keyof typeof ScreenKind];

export type Transition =
  | { readonly kind: typeof ScreenKind.MainMenu }
  | { readonly kind: typeof ScreenKind.SelectWorld; readonly mode: GameMode }
  | { readonly kind: typeof ScreenKind.Game; readonly selection: GameSelection }
  | { readonly kind: typeof ScreenKind.OnlineMenu; readonly entry: LobbyEntry }
  | { readonly kind: typeof ScreenKind.LobbyRoom; readonly entry: LobbyEntry }
  | { readonly kind: typeof ScreenKind.OnlineGame; readonly start: GameStarted };

export interface OnlineMatchExit {
  leaveGame(): void;
}

const NO_MATCH_EXIT: OnlineMatchExit = { leaveGame: () => undefined };

export const FAILED_MATCH_RESULT: OnlineSessionResult = { end: OnlineEnd.Failed, state: CompletionState.Error, gameOver: undefined };

export const DEFAULT_RETURN_MODE: GameMode = GameMode.Single;
export const CODE_JOIN_MENU_MODE: OnlineMode = GameMode.Coop;
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
    private readonly match: OnlineMatchExit = NO_MATCH_EXIT,
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

  openLobby(mode: OnlineMode, result?: OnlineSessionResult): void {
    this.pending = { kind: ScreenKind.OnlineMenu, entry: { mode, result } };
  }

  enterLobby(mode: OnlineMode, result?: OnlineSessionResult): void {
    this.pending = { kind: ScreenKind.LobbyRoom, entry: { mode, result } };
  }

  joinByCode(code: string): void {
    this.pending = { kind: ScreenKind.OnlineMenu, entry: { mode: CODE_JOIN_MENU_MODE, result: undefined, joinCode: code } };
  }

  startOnlineGame(start: GameStarted): void {
    this.pending = { kind: ScreenKind.OnlineGame, start };
  }

  finishOnlineGame(result: OnlineSessionResult, inLobby: boolean): void {
    const mode = this.returnMode === GameMode.Single ? undefined : this.returnMode;
    this.logger.info(LogEvent.GameFinished, { state: result.state, end: result.end, mode: this.returnMode });
    if (!mode) this.pending = { kind: ScreenKind.MainMenu };
    else this.pending = { kind: inLobby ? ScreenKind.LobbyRoom : ScreenKind.OnlineMenu, entry: { mode, result } };
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

  key(code: string, typed?: string): boolean {
    return this.current?.key(code, typed) ?? false;
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
      case ScreenKind.OnlineMenu:
        this.returnMode = transition.entry.mode;
        this.show(this.factory.onlineMenu(this, transition.entry));
        return;
      case ScreenKind.LobbyRoom:
        this.returnMode = transition.entry.mode;
        this.show(this.factory.lobbyRoom(this, transition.entry));
        return;
      case ScreenKind.OnlineGame:
        this.returnMode = transition.start.mode;
        try {
          this.show(this.factory.onlineGame(this, transition.start));
        } catch (error) {
          this.logger.error(LogEvent.WorldFailed, { room: transition.start.roomId, error: String(error) });
          this.match.leaveGame();
          this.show(this.factory.lobbyRoom(this, { mode: transition.start.mode, result: FAILED_MATCH_RESULT }));
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
