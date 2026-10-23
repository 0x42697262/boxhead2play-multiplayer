import type { KeyValueStore } from '../../adapters/storage/KeyValueStore.ts';
import type { MultiplierListEntry } from '../../domain/upgrades/Upgrades.ts';
import type { PlayerCharacter } from '../../domain/world/SimulationSettings.ts';
import type { ControlMasks } from '../../net/controlMask.ts';
import {
  ClientMessageType,
  PROTOCOL_VERSION,
  ServerMessageType,
  type ClientMessage,
  type ErrorReason,
  type GameOver,
  type GameStarted,
  type LeaveReason,
  type LobbyDto,
  type LobbyOptions,
  type LobbySummaryDto,
  type NetFrame,
  type OnlineMode,
  type ServerMessage,
} from '../../net/protocol.ts';
import type { Logger } from '../../observability/logger.ts';
import { LogEvent } from '../../text/logEvents.ts';

export const SESSION_STORAGE_KEY = 'boxhead2play.onlineSession';

export const OnlineStatus = {
  Offline: 'offline',
  Connecting: 'connecting',
  Online: 'online',
} as const;

export type OnlineStatus = (typeof OnlineStatus)[keyof typeof OnlineStatus];

export interface OnlineState {
  readonly status: OnlineStatus;
  readonly clientId: string | undefined;
  readonly lobbies: readonly LobbySummaryDto[];
  readonly lobby: LobbyDto | undefined;
  readonly error: ErrorReason | undefined;
  readonly leftReason: LeaveReason | undefined;
  readonly result: GameOver | undefined;
}

export interface Transport {
  connect(): void;
  disconnect(): void;
  send(message: ClientMessage): boolean;
}

export interface GameSink {
  readonly matchId: string;
  frame(frame: NetFrame): void;
  upgrades(upgrades: readonly MultiplierListEntry[]): void;
  gameOver(result: GameOver): void;
  lost(): void;
}

export type StateListener = (state: OnlineState) => void;

const INITIAL_STATE: OnlineState = {
  status: OnlineStatus.Offline,
  clientId: undefined,
  lobbies: [],
  lobby: undefined,
  error: undefined,
  leftReason: undefined,
  result: undefined,
};

export interface OnlineClientDependencies {
  readonly session: KeyValueStore;
  readonly name: () => string;
  readonly logger: Logger;
  readonly onGameStarted: (start: GameStarted) => void;
}

export class OnlineClient {
  private transport: Transport | undefined = undefined;
  private current: OnlineState = INITIAL_STATE;
  private watching: OnlineMode | null = null;
  private welcomed = false;
  private queued: ClientMessage[] = [];
  private sink: GameSink | undefined = undefined;
  private readonly listeners = new Set<StateListener>();

  constructor(private readonly deps: OnlineClientDependencies) {}

  get state(): OnlineState {
    return this.current;
  }

  get lobby(): LobbyDto | undefined {
    return this.current.lobby;
  }

  get isHost(): boolean {
    return this.current.lobby?.members.some((member) => member.host && member.id === this.current.clientId) ?? false;
  }

  bind(transport: Transport): void {
    this.transport = transport;
  }

  start(): void {
    if (this.current.status !== OnlineStatus.Offline) return;
    this.update({ status: OnlineStatus.Connecting });
    this.transport?.connect();
  }

  stop(): void {
    this.send({ type: ClientMessageType.LeaveLobby });
    this.transport?.disconnect();
    this.welcomed = false;
    this.queued = [];
    this.watching = null;
    this.current = INITIAL_STATE;
    this.notify();
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  attachGame(sink: GameSink): () => void {
    this.sink = sink;
    return () => {
      if (this.sink === sink) this.sink = undefined;
    };
  }

  clearNotice(): void {
    this.update({ error: undefined, leftReason: undefined, result: undefined });
  }

  watch(mode: OnlineMode): void {
    this.watching = mode;
    this.send({ type: ClientMessageType.WatchLobbies, mode });
  }

  createLobby(mode: OnlineMode, roomId: string, options: LobbyOptions, character: PlayerCharacter): void {
    this.send({ type: ClientMessageType.CreateLobby, mode, roomId, options, character });
  }

  joinLobby(lobbyId: string, character: PlayerCharacter): void {
    this.send({ type: ClientMessageType.JoinLobby, lobbyId, character });
  }

  leaveLobby(): void {
    this.send({ type: ClientMessageType.LeaveLobby });
  }

  configure(roomId: string, options: LobbyOptions): void {
    this.send({ type: ClientMessageType.ConfigureLobby, roomId, options });
  }

  setCharacter(character: PlayerCharacter): void {
    this.send({ type: ClientMessageType.SetCharacter, character });
  }

  rename(name: string): void {
    this.send({ type: ClientMessageType.SetName, name });
  }

  play(): void {
    this.send({ type: ClientMessageType.StartGame });
  }

  leaveGame(): void {
    this.send({ type: ClientMessageType.LeaveGame });
  }

  input(masks: ControlMasks): boolean {
    if (!this.welcomed) return false;
    return this.transport?.send({ type: ClientMessageType.Input, ...masks }) ?? false;
  }

  opened(): void {
    this.transport?.send({ type: ClientMessageType.Hello, version: PROTOCOL_VERSION, sessionId: this.deps.session.read(SESSION_STORAGE_KEY) ?? null, name: this.deps.name() });
  }

  closed(): void {
    this.welcomed = false;
    if (this.current.status === OnlineStatus.Offline) return;
    this.deps.logger.info(LogEvent.OnlineDisconnected);
    this.update({ status: OnlineStatus.Connecting });
  }

  rejected(text: string): void {
    this.deps.logger.warn(LogEvent.OnlineError, { length: text.length });
  }

  receive(message: ServerMessage): void {
    switch (message.type) {
      case ServerMessageType.Welcome:
        this.welcome(message.clientId, message.sessionId, message.resumed);
        return;
      case ServerMessageType.Lobbies:
        this.update({ lobbies: message.lobbies });
        return;
      case ServerMessageType.Lobby:
        this.update({ lobby: message.lobby, leftReason: undefined });
        return;
      case ServerMessageType.LobbyLeft:
        this.update({ lobby: undefined, leftReason: message.reason });
        return;
      case ServerMessageType.GameStarted:
        if (this.sink?.matchId !== message.matchId) this.deps.onGameStarted(message);
        return;
      case ServerMessageType.Frame:
        this.sink?.frame(message);
        return;
      case ServerMessageType.Upgrades:
        this.sink?.upgrades(message.upgrades);
        return;
      case ServerMessageType.GameOver:
        this.update({ result: message });
        if (this.sink?.matchId === message.matchId) this.sink.gameOver(message);
        return;
      case ServerMessageType.Error:
        this.deps.logger.warn(LogEvent.OnlineError, { reason: message.reason });
        this.update({ error: message.reason });
        return;
    }
  }

  private welcome(clientId: string, sessionId: string, resumed: boolean): void {
    this.deps.session.write(SESSION_STORAGE_KEY, sessionId);
    this.welcomed = true;
    this.deps.logger.info(LogEvent.OnlineConnected, { resumed });
    if (!resumed) {
      this.sink?.lost();
      this.update({ status: OnlineStatus.Online, clientId, lobby: undefined });
    } else {
      this.update({ status: OnlineStatus.Online, clientId });
    }
    const pending = this.queued;
    this.queued = [];
    if (this.watching && !pending.some((message) => message.type === ClientMessageType.WatchLobbies)) {
      this.transport?.send({ type: ClientMessageType.WatchLobbies, mode: this.watching });
    }
    for (const message of pending) this.transport?.send(message);
  }

  private send(message: ClientMessage): void {
    if (this.welcomed && this.transport?.send(message)) return;
    if (this.current.status === OnlineStatus.Offline) return;
    this.queued.push(message);
  }

  private update(change: Partial<OnlineState>): void {
    this.current = { ...this.current, ...change };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.current);
  }
}
