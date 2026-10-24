import {
  ClientMessageType,
  decodeClientMessage,
  ErrorReason,
  LeaveReason,
  LobbyState,
  PROTOCOL_VERSION,
  ServerMessageType,
  type ClientMessage,
  type ErrorReason as ErrorReasonValue,
  type OnlineMode,
  type ServerMessage,
} from '../net/protocol.ts';
import { LogEvent } from '../text/logEvents.ts';
import { Lobby, type LobbyClient } from './Lobby.ts';
import type { CancelTimer, Connection, HubDependencies } from './ports.ts';
import { lobbyCodeFromNumber, normalizeLobbyCode } from '../net/lobbyCode.ts';
import { secondsSince } from './elapsed.ts';
import { ClientActivity, type MonitorClient, type MonitorLobby, type Traffic } from './monitorProtocol.ts';
import { nameKey, sanitizeName, uniqueName } from './sanitize.ts';
import { MAX_CLIENTS, MAX_LOBBIES, MAX_MESSAGE_BYTES, MESSAGE_BURST, MESSAGE_RATE_PER_SECOND, MS_PER_SECOND, RECONNECT_GRACE_MS } from './tuning.ts';

class ClientSession implements LobbyClient {
  connection: Connection | undefined;
  watching: OnlineMode | null = null;
  lobby: Lobby | undefined = undefined;
  cancelExpiry: CancelTimer | undefined = undefined;

  constructor(
    readonly id: string,
    readonly sessionId: string,
    public name: string,
    connection: Connection,
    readonly startedMs: number,
  ) {
    this.connection = connection;
  }

  get connected(): boolean {
    return this.connection !== undefined;
  }

  send(message: ServerMessage): void {
    this.connection?.send(message);
  }
}

const NO_TRAFFIC: Traffic = { bytesSent: 0, bytesReceived: 0 };

function clientActivity(connected: boolean, lobbyState: LobbyState | undefined, playerIndex: number | null): ClientActivity {
  if (!connected) return ClientActivity.Offline;
  if (lobbyState === undefined) return ClientActivity.Menu;
  return lobbyState === LobbyState.Playing && playerIndex !== null ? ClientActivity.Playing : ClientActivity.Lobby;
}

class RateLimiter {
  private tokens = MESSAGE_BURST;
  private last: number;

  constructor(now: number) {
    this.last = now;
  }

  allow(now: number): boolean {
    this.tokens = Math.min(MESSAGE_BURST, this.tokens + ((now - this.last) * MESSAGE_RATE_PER_SECOND) / MS_PER_SECOND);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}

export interface Link {
  receive(text: string): void;
  closed(): void;
}

export class Hub {
  private readonly sessions = new Map<string, ClientSession>();
  private readonly lobbies = new Map<string, Lobby>();

  private readonly codes = new Map<string, string>();
  constructor(private readonly deps: HubDependencies) {}

  get lobbyCount(): number {
    return this.lobbies.size;
  }

  get clientCount(): number {
    return this.sessions.size;
  }

  lobby(id: string): Lobby | undefined {
    return this.lobbies.get(id);
  }

  connect(connection: Connection): Link {
    let client: ClientSession | undefined;
    const limiter = new RateLimiter(this.deps.clock.now());
    return {
      receive: (text) => {
        if (text.length > MAX_MESSAGE_BYTES || !limiter.allow(this.deps.clock.now())) {
          this.reject(connection, ErrorReason.RateLimited);
          return;
        }
        const message = decodeClientMessage(text);
        if (!message) {
          this.reject(connection, ErrorReason.BadMessage);
          return;
        }
        if (message.type === ClientMessageType.Hello) {
          client = this.hello(connection, message, client);
          return;
        }
        if (client?.connection === connection) this.handle(client, message);
      },
      closed: () => {
        if (client?.connection === connection) this.disconnected(client);
      },
    };
  }

  monitorClients(): MonitorClient[] {
    const now = this.deps.clock.now();
    return [...this.sessions.values()].map((session) => {
      const lobby = session.lobby?.dto();
      const member = lobby?.members.find((candidate) => candidate.id === session.id);
      const traffic = session.connection?.traffic() ?? NO_TRAFFIC;
      return {
        id: session.id,
        name: session.name,
        activity: clientActivity(session.connected, lobby?.state, member?.playerIndex ?? null),
        lobby: lobby?.name ?? null,
        mode: lobby?.mode ?? session.watching,
        onlineSeconds: secondsSince(session.startedMs, now),
        ...traffic,
      };
    });
  }

  monitorLobbies(): MonitorLobby[] {
    return [...this.lobbies.values()].map((lobby) => lobby.monitorRow());
  }

  close(): void {
    for (const lobby of [...this.lobbies.values()]) lobby.close();
    for (const session of this.sessions.values()) session.cancelExpiry?.();
    this.sessions.clear();
  }

  private reject(connection: Connection, reason: ErrorReasonValue): void {
    connection.send({ type: ServerMessageType.Error, reason });
    this.deps.logger.debug(LogEvent.MessageRejected, { reason });
  }

  private hello(connection: Connection, message: Extract<ClientMessage, { type: 'hello' }>, current: ClientSession | undefined): ClientSession | undefined {
    if (current) return current;
    if (message.version !== PROTOCOL_VERSION) {
      this.reject(connection, ErrorReason.VersionMismatch);
      connection.close();
      return undefined;
    }
    const known = message.sessionId === null ? undefined : this.sessions.get(message.sessionId);
    if (known) return this.resume(known, connection, message.name);
    if (this.sessions.size >= MAX_CLIENTS) {
      this.reject(connection, ErrorReason.RateLimited);
      connection.close();
      return undefined;
    }
    const session = new ClientSession(this.deps.newId(), this.deps.newId(), this.freeName(message.name, undefined), connection, this.deps.clock.now());
    this.sessions.set(session.sessionId, session);
    session.send({ type: ServerMessageType.Welcome, clientId: session.id, sessionId: session.sessionId, resumed: false });
    this.deps.logger.info(LogEvent.ClientConnected, { client: session.id, clients: this.sessions.size });
    return session;
  }

  private freeCode(): string {
    const seed = this.deps.newSeed();
    for (let attempt = 0; ; attempt++) {
      const code = lobbyCodeFromNumber(seed + attempt);
      if (!this.codes.has(code)) return code;
    }
  }

  private freeName(raw: string, self: ClientSession | undefined): string {
    const taken = new Set([...this.sessions.values()].filter((other) => other !== self).map((other) => nameKey(other.name)));
    return uniqueName(sanitizeName(raw), taken);
  }

  private resume(session: ClientSession, connection: Connection, name: string): ClientSession {
    const previous = session.connection;
    session.connection = connection;
    session.name = this.freeName(name, session);
    session.cancelExpiry?.();
    session.cancelExpiry = undefined;
    previous?.close();
    session.send({ type: ServerMessageType.Welcome, clientId: session.id, sessionId: session.sessionId, resumed: true });
    this.deps.logger.info(LogEvent.ClientResumed, { client: session.id });
    if (session.lobby) session.lobby.connectionChanged(session);
    else if (session.watching) this.sendLobbies(session, session.watching);
    return session;
  }

  private disconnected(session: ClientSession): void {
    session.connection = undefined;
    session.lobby?.connectionChanged(session);
    this.deps.logger.info(LogEvent.ClientDisconnected, { client: session.id });
    session.cancelExpiry = this.deps.timers.after(RECONNECT_GRACE_MS, () => this.expire(session));
  }

  private expire(session: ClientSession): void {
    session.cancelExpiry = undefined;
    if (session.connected) return;
    session.lobby?.remove(session, LeaveReason.Expired);
    session.lobby = undefined;
    this.sessions.delete(session.sessionId);
    this.deps.logger.info(LogEvent.ClientExpired, { client: session.id, clients: this.sessions.size });
  }

  private handle(session: ClientSession, message: ClientMessage): void {
    const error = this.dispatch(session, message);
    if (error) session.send({ type: ServerMessageType.Error, reason: error });
  }

  private dispatch(session: ClientSession, message: ClientMessage): ErrorReasonValue | undefined {
    switch (message.type) {
      case ClientMessageType.Hello:
        return undefined;
      case ClientMessageType.SetName:
        session.name = this.freeName(message.name, session);
        session.lobby?.memberChanged(session);
        return undefined;
      case ClientMessageType.WatchLobbies:
        session.watching = message.mode;
        if (message.mode) this.sendLobbies(session, message.mode);
        return undefined;
      case ClientMessageType.CreateLobby:
        return this.createLobby(session, message);
      case ClientMessageType.JoinLobby:
        return this.joinLobby(session, message.lobbyId, message.character);
      case ClientMessageType.JoinByCode: {
        const lobbyId = this.codes.get(normalizeLobbyCode(message.code));
        return lobbyId === undefined ? ErrorReason.CodeNotFound : this.joinLobby(session, lobbyId, message.character);
      }
      case ClientMessageType.LeaveLobby:
        this.leaveLobby(session);
        return undefined;
      case ClientMessageType.ConfigureLobby:
        return session.lobby ? session.lobby.configure(session, message.roomId, message.options) : ErrorReason.NotInLobby;
      case ClientMessageType.SetCharacter:
        session.lobby?.setCharacter(session, message.character);
        return undefined;
      case ClientMessageType.StartGame:
        return session.lobby ? session.lobby.play(session) : ErrorReason.NotInLobby;
      case ClientMessageType.LeaveGame:
        session.lobby?.leaveGame(session);
        return undefined;
      case ClientMessageType.Input:
        session.lobby?.input(session, message);
        return undefined;
      case ClientMessageType.Ping:
        session.send({ type: ServerMessageType.Pong, id: message.id });
        return undefined;
    }
  }

  private createLobby(session: ClientSession, message: Extract<ClientMessage, { type: 'createLobby' }>): ErrorReasonValue | undefined {
    if (!this.deps.content.rooms.has(message.roomId)) return ErrorReason.RoomUnknown;
    if (this.lobbies.size >= MAX_LOBBIES) return ErrorReason.LobbyLimit;
    this.leaveLobby(session);
    const lobby = new Lobby({ id: this.deps.newId(), code: this.freeCode(), mode: message.mode, roomId: message.roomId, options: message.options }, session, message.character, {
      content: this.deps.content,
      ticker: this.deps.ticker,
      newId: this.deps.newId,
      newSeed: this.deps.newSeed,
      clock: this.deps.clock,
      logger: this.deps.logger,
      onChanged: (changed) => this.lobbyChanged(changed),
      onEmpty: (empty) => this.lobbyClosed(empty),
    });
    this.lobbies.set(lobby.id, lobby);
    this.codes.set(lobby.code, lobby.id);
    session.lobby = lobby;
    this.deps.logger.info(LogEvent.LobbyCreated, { lobby: lobby.id, mode: lobby.mode, room: message.roomId });
    session.send({ type: ServerMessageType.Lobby, lobby: lobby.dto() });
    this.lobbyChanged(lobby);
    return undefined;
  }

  private joinLobby(session: ClientSession, lobbyId: string, character: Parameters<Lobby['add']>[1]): ErrorReasonValue | undefined {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return ErrorReason.LobbyNotFound;
    if (session.lobby === lobby) return undefined;
    this.leaveLobby(session);
    const error = lobby.add(session, character);
    if (error) return error;
    session.lobby = lobby;
    return undefined;
  }

  private leaveLobby(session: ClientSession): void {
    const lobby = session.lobby;
    if (!lobby) return;
    session.lobby = undefined;
    lobby.remove(session, LeaveReason.Left);
  }

  private lobbyChanged(lobby: Lobby): void {
    for (const session of this.sessions.values()) {
      if (session.watching === lobby.mode && !session.lobby) this.sendLobbies(session, lobby.mode);
    }
  }

  private lobbyClosed(lobby: Lobby): void {
    this.lobbies.delete(lobby.id);
    this.codes.delete(lobby.code);
    for (const session of this.sessions.values()) if (session.lobby === lobby) session.lobby = undefined;
    this.lobbyChanged(lobby);
  }

  private sendLobbies(session: ClientSession, mode: OnlineMode): void {
    const lobbies = [...this.lobbies.values()].filter((lobby) => lobby.mode === mode).map((lobby) => lobby.summary());
    session.send({ type: ServerMessageType.Lobbies, lobbies });
  }
}
