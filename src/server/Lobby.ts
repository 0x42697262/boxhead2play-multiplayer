import { CompletionState } from '../domain/world/CompletionState.ts';
import type { PlayerCharacter } from '../domain/world/SimulationSettings.ts';
import type { ControlMasks } from '../net/controlMask.ts';
import {
  ErrorReason,
  LeaveReason,
  LobbyState,
  ServerMessageType,
  type LobbyDto,
  type LobbyOptions,
  type LobbySummaryDto,
  type OnlineMode,
  type ServerMessage,
} from '../net/protocol.ts';
import { MAX_LOBBY_PLAYERS } from '../net/tuning.ts';
import type { Logger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';
import { Match, type MatchResult, type MatchStep } from './Match.ts';
import { secondsSince } from './elapsed.ts';
import type { MonitorLobby } from './monitorProtocol.ts';
import type { Clock, GameContent, StopTicking, Ticker } from './ports.ts';
import { lobbyName } from './sanitize.ts';
import { MATCH_ABANDONED, TICK_TIME_SMOOTHING } from './tuning.ts';

export interface LobbyClient {
  readonly id: string;
  readonly name: string;
  readonly connected: boolean;
  send(message: ServerMessage): void;
}

export interface LobbyMember {
  readonly client: LobbyClient;
  character: PlayerCharacter;
  playerIndex: number | undefined;
}

export interface LobbyDependencies {
  readonly content: GameContent;
  readonly ticker: Ticker;
  readonly newId: () => string;
  readonly newSeed: () => number;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly onChanged: (lobby: Lobby) => void;
  readonly onEmpty: (lobby: Lobby) => void;
}

export interface LobbySetup {
  readonly id: string;
  readonly code: string;
  readonly mode: OnlineMode;
  readonly roomId: string;
  readonly options: LobbyOptions;
}

export class Lobby {
  readonly id: string;
  readonly code: string;
  readonly mode: OnlineMode;
  private roomId: string;
  private options: LobbyOptions;
  private readonly members: LobbyMember[] = [];
  private hostId: string;
  private match: Match | undefined = undefined;
  private stopTicking: StopTicking | undefined = undefined;
  private tickMs: number | undefined = undefined;
  private readonly createdMs: number;
  private matchStartedMs: number | undefined = undefined;

  constructor(
    setup: LobbySetup,
    host: LobbyClient,
    character: PlayerCharacter,
    private readonly deps: LobbyDependencies,
  ) {
    this.id = setup.id;
    this.code = setup.code;
    this.createdMs = deps.clock.now();
    this.mode = setup.mode;
    this.roomId = setup.roomId;
    this.options = setup.options;
    this.hostId = host.id;
    this.members.push({ client: host, character, playerIndex: undefined });
  }

  get state(): LobbyState {
    return this.match ? LobbyState.Playing : LobbyState.Waiting;
  }

  get size(): number {
    return this.members.length;
  }

  get full(): boolean {
    return this.members.length >= MAX_LOBBY_PLAYERS;
  }

  get activeMatch(): Match | undefined {
    return this.match;
  }

  get host(): LobbyMember | undefined {
    return this.member(this.hostId);
  }

  has(client: LobbyClient): boolean {
    return this.member(client.id) !== undefined;
  }

  dto(): LobbyDto {
    const host = this.host;
    return {
      id: this.id,
      code: this.code,
      name: lobbyName(host?.client.name ?? ''),
      mode: this.mode,
      roomId: this.roomId,
      options: this.options,
      state: this.state,
      maxPlayers: MAX_LOBBY_PLAYERS,
      members: this.members.map((member) => ({
        id: member.client.id,
        name: member.client.name,
        character: member.character,
        host: member.client.id === this.hostId,
        connected: member.client.connected,
        playerIndex: member.playerIndex ?? null,
      })),
    };
  }

  summary(): LobbySummaryDto {
    const { id, name, mode, roomId, state, maxPlayers } = this.dto();
    return { id, name, mode, roomId, state, maxPlayers, players: this.members.length };
  }

  add(client: LobbyClient, character: PlayerCharacter): ErrorReason | undefined {
    if (this.has(client)) return undefined;
    if (this.full) return ErrorReason.LobbyFull;
    this.members.push({ client, character, playerIndex: undefined });
    this.changed();
    return undefined;
  }

  remove(client: LobbyClient, reason: LeaveReason): void {
    const member = this.member(client.id);
    if (!member) return;
    this.leaveMatch(member);
    this.members.splice(this.members.indexOf(member), 1);
    client.send({ type: ServerMessageType.LobbyLeft, reason });
    if (this.members.length === 0) {
      this.close();
      return;
    }
    if (this.hostId === client.id) this.hostId = (this.members.find((other) => other.client.connected) ?? this.members[0])?.client.id ?? this.hostId;
    this.changed();
  }

  configure(client: LobbyClient, roomId: string, options: LobbyOptions): ErrorReason | undefined {
    if (client.id !== this.hostId) return ErrorReason.NotHost;
    if (this.match) return ErrorReason.AlreadyPlaying;
    if (!this.deps.content.rooms.has(roomId)) return ErrorReason.RoomUnknown;
    this.roomId = roomId;
    this.options = options;
    this.changed();
    return undefined;
  }

  setCharacter(client: LobbyClient, character: PlayerCharacter): void {
    const member = this.member(client.id);
    if (!member || member.character === character) return;
    member.character = character;
    this.changed();
  }

  memberChanged(client: LobbyClient): void {
    if (this.has(client)) this.changed();
  }

  play(client: LobbyClient): ErrorReason | undefined {
    const member = this.member(client.id);
    if (!member) return ErrorReason.NotInLobby;
    if (!this.match) return member.client.id === this.hostId ? this.startMatch() : ErrorReason.NotHost;
    if (member.playerIndex !== undefined) return undefined;
    const index = this.match.join(member.character);
    if (index === undefined) return ErrorReason.LobbyFull;
    member.playerIndex = index;
    this.sendStart(member, this.match);
    this.changed();
    return undefined;
  }

  leaveGame(client: LobbyClient): void {
    const member = this.member(client.id);
    if (!member || member.playerIndex === undefined) return;
    this.leaveMatch(member);
    this.changed();
  }

  input(client: LobbyClient, masks: ControlMasks): void {
    const index = this.member(client.id)?.playerIndex;
    if (index !== undefined) this.match?.input(index, masks);
  }

  connectionChanged(client: LobbyClient): void {
    const member = this.member(client.id);
    if (!member) return;
    if (!client.connected && member.playerIndex !== undefined) this.match?.releaseControls(member.playerIndex);
    if (client.connected) this.resync(member);
    this.changed();
  }

  close(): void {
    this.stopMatch();
    for (const member of this.members.splice(0)) member.client.send({ type: ServerMessageType.LobbyLeft, reason: LeaveReason.Closed });
    this.deps.logger.info(LogEvent.LobbyClosed, { lobby: this.id });
    this.deps.onEmpty(this);
  }

  private member(clientId: string): LobbyMember | undefined {
    return this.members.find((member) => member.client.id === clientId);
  }

  private resync(member: LobbyMember): void {
    member.client.send({ type: ServerMessageType.Lobby, lobby: this.dto() });
    if (this.match && member.playerIndex !== undefined) this.sendStart(member, this.match);
  }

  private startMatch(): ErrorReason | undefined {
    const players = this.members.filter((member) => member.client.connected);
    const match = Match.start(
      { id: this.deps.newId(), mode: this.mode, roomId: this.roomId, options: this.options, characters: players.map((member) => member.character), seed: this.deps.newSeed() },
      this.deps.content,
    );
    if (!match) return ErrorReason.RoomUnknown;
    this.match = match;
    this.matchStartedMs = this.deps.clock.now();
    players.forEach((member, index) => {
      member.playerIndex = index;
      this.sendStart(member, match);
    });
    this.stopTicking = this.deps.ticker.start(match.ticksPerSecond, () => this.tick(match));
    this.deps.logger.info(LogEvent.MatchStarted, { lobby: this.id, match: match.setup.id, room: this.roomId, mode: this.mode, players: players.length });
    this.changed();
    return undefined;
  }

  private sendStart(member: LobbyMember, match: Match): void {
    if (member.playerIndex === undefined) return;
    member.client.send({
      type: ServerMessageType.GameStarted,
      matchId: match.setup.id,
      lobbyId: this.id,
      mode: this.mode,
      roomId: match.setup.roomId,
      options: match.setup.options,
      playerIndex: member.playerIndex,
      ticksPerSecond: match.ticksPerSecond,
      projectionFactor: match.world.projectionFactor,
    });
    member.client.send({ type: ServerMessageType.Upgrades, upgrades: match.upgrades });
  }

  monitorRow(): MonitorLobby {
    const { id, name, mode, state } = this.dto();
    const now = this.deps.clock.now();
    const running = this.match !== undefined && this.matchStartedMs !== undefined;
    return {
      id,
      name,
      mode,
      state,
      members: this.members.length,
      tickMs: running ? (this.tickMs ?? null) : null,
      ageSeconds: secondsSince(this.createdMs, now),
      matchSeconds: running && this.matchStartedMs !== undefined ? secondsSince(this.matchStartedMs, now) : null,
    };
  }

  private tick(match: Match): void {
    if (match !== this.match) return;
    const started = this.deps.clock.now();
    this.step(match);
    const elapsed = this.deps.clock.now() - started;
    this.tickMs = this.tickMs === undefined ? elapsed : this.tickMs + (elapsed - this.tickMs) * TICK_TIME_SMOOTHING;
  }

  private step(match: Match): void {
    let step: MatchStep;
    try {
      step = match.step();
    } catch (error) {
      this.deps.logger.error(LogEvent.ServerFailed, { lobby: this.id, match: match.setup.id, error: String(error) });
      this.finish(match, { state: CompletionState.Error, winnerIndex: undefined, score: match.world.hud.totalScore });
      return;
    }
    for (const member of this.members) {
      if (member.playerIndex === undefined) continue;
      const frame = step.frames.get(member.playerIndex);
      if (frame) member.client.send(frame);
      if (step.upgrades) member.client.send({ type: ServerMessageType.Upgrades, upgrades: step.upgrades });
    }
    if (step.result) this.finish(match, step.result);
  }

  private finish(match: Match, result: MatchResult): void {
    const winner = this.members.find((member) => member.playerIndex !== undefined && member.playerIndex === result.winnerIndex);
    for (const member of this.members) {
      if (member.playerIndex === undefined) continue;
      member.client.send({ type: ServerMessageType.GameOver, matchId: match.setup.id, state: result.state, winnerName: winner?.client.name ?? null, score: result.score });
    }
    this.deps.logger.info(LogEvent.MatchEnded, { lobby: this.id, match: match.setup.id, state: result.state, score: result.score, ticks: match.world.tick });
    this.stopMatch();
    this.changed();
  }

  private leaveMatch(member: LobbyMember): void {
    const match = this.match;
    if (!match || member.playerIndex === undefined) return;
    match.leave(member.playerIndex);
    member.playerIndex = undefined;
    if (this.members.every((other) => other.playerIndex === undefined)) {
      this.deps.logger.info(LogEvent.MatchEnded, { lobby: this.id, match: match.setup.id, state: MATCH_ABANDONED, ticks: match.world.tick });
      this.stopMatch();
    }
  }

  private stopMatch(): void {
    this.stopTicking?.();
    this.stopTicking = undefined;
    this.match = undefined;
    for (const member of this.members) member.playerIndex = undefined;
  }

  private changed(): void {
    const lobby = this.dto();
    for (const member of this.members) member.client.send({ type: ServerMessageType.Lobby, lobby });
    this.deps.onChanged(this);
  }
}
