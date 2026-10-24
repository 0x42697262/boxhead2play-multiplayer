import { z } from 'zod';
import { DecalKind, DomainEventType, MessageTone, type DecalRequested, type ScoreAwarded, type SoundRequested } from '../domain/events.ts';
import type { HudMessageEntry } from '../domain/hud/HudState.ts';
import { SoundId } from '../domain/sounds.ts';
import type { PlayerHudStatus } from '../domain/things/PlayerThing.ts';
import type { MultiplierListEntry } from '../domain/upgrades/Upgrades.ts';
import type { DrawEntry } from '../domain/visuals.ts';
import { CompletionState } from '../domain/world/CompletionState.ts';
import { GameMode } from '../domain/world/GameMode.ts';
import { Difficulty, GameAmount, GameSpeed, PlayerCharacter, type GameOptions } from '../domain/world/SimulationSettings.ts';
import type { CameraView } from '../domain/world/World.ts';
import { isTextKey } from '../text/i18n.ts';
import { CONTROL_MASK_LIMIT } from './controlMask.ts';
import {
  FRACTION_DIGITS_SCALE,
  LOBBY_CODE_LENGTH,
  LOBBY_ID_MAX_LENGTH,
  MAX_LOBBY_PLAYERS,
  PLAYER_NAME_MAX_LENGTH,
  PROTOCOL_VERSION,
  RAW_NAME_MAX_LENGTH,
  ROOM_ID_MAX_LENGTH,
  SESSION_ID_MAX_LENGTH,
} from './tuning.ts';

const numericEnum = <T extends Record<string, number>>(values: T) =>
  z.number().int().refine((value): value is T[keyof T] => Object.values(values).includes(value));

const stringEnum = <T extends Record<string, string>>(values: T) => z.enum(Object.values(values) as [T[keyof T], ...T[keyof T][]]);

const OnlineModeSchema = z.enum([GameMode.Coop, GameMode.DeathMatch]);
export type OnlineMode = z.infer<typeof OnlineModeSchema>;

export const ONLINE_MODES: readonly OnlineMode[] = OnlineModeSchema.options;

export function isOnlineMode(mode: GameMode): mode is OnlineMode {
  return (ONLINE_MODES as readonly GameMode[]).includes(mode);
}

const CharacterSchema = numericEnum(PlayerCharacter);
const NameSchema = z.string().max(PLAYER_NAME_MAX_LENGTH);
const RawNameSchema = z.string().max(RAW_NAME_MAX_LENGTH);
const LobbyIdSchema = z.string().min(1).max(LOBBY_ID_MAX_LENGTH);
const RoomIdSchema = z.string().min(1).max(ROOM_ID_MAX_LENGTH);
const MaskSchema = z.number().int().min(0).lt(CONTROL_MASK_LIMIT);

export const LobbyOptionsSchema = z.object({
  difficulty: numericEnum(Difficulty),
  gameSpeed: numericEnum(GameSpeed),
  devilsActive: z.boolean(),
  collisionsActive: z.boolean(),
  damageActive: z.boolean(),
  gameAmount: numericEnum(GameAmount),
  detail: z.boolean(),
});

export type LobbyOptions = z.infer<typeof LobbyOptionsSchema>;

export function gameOptionsFor(mode: OnlineMode, options: LobbyOptions, playerCharacters: readonly PlayerCharacter[]): GameOptions {
  return { ...options, gameMode: mode, playerCharacters };
}

export const LobbyState = {
  Waiting: 'waiting',
  Playing: 'playing',
} as const;

export type LobbyState = (typeof LobbyState)[keyof typeof LobbyState];

const MemberSchema = z.object({
  id: z.string(),
  name: NameSchema,
  character: CharacterSchema,
  host: z.boolean(),
  connected: z.boolean(),
  playerIndex: z.number().int().min(0).lt(MAX_LOBBY_PLAYERS).nullable(),
});

export type MemberDto = z.infer<typeof MemberSchema>;

const LobbySchema = z.object({
  id: LobbyIdSchema,
  code: z.string().length(LOBBY_CODE_LENGTH),
  name: NameSchema,
  mode: OnlineModeSchema,
  roomId: RoomIdSchema,
  options: LobbyOptionsSchema,
  state: stringEnum(LobbyState),
  maxPlayers: z.number().int().positive(),
  members: z.array(MemberSchema),
});

export type LobbyDto = z.infer<typeof LobbySchema>;

const LobbySummarySchema = z.object({
  id: LobbyIdSchema,
  name: NameSchema,
  mode: OnlineModeSchema,
  roomId: RoomIdSchema,
  state: stringEnum(LobbyState),
  players: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
});

export type LobbySummaryDto = z.infer<typeof LobbySummarySchema>;

export const ClientMessageType = {
  Hello: 'hello',
  SetName: 'setName',
  WatchLobbies: 'watchLobbies',
  CreateLobby: 'createLobby',
  JoinLobby: 'joinLobby',
  JoinByCode: 'joinByCode',
  LeaveLobby: 'leaveLobby',
  ConfigureLobby: 'configureLobby',
  SetCharacter: 'setCharacter',
  StartGame: 'startGame',
  LeaveGame: 'leaveGame',
  Input: 'input',
  Ping: 'ping',
} as const;

const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(ClientMessageType.Hello), version: z.number().int(), sessionId: z.string().max(SESSION_ID_MAX_LENGTH).nullable(), name: RawNameSchema }),
  z.object({ type: z.literal(ClientMessageType.SetName), name: RawNameSchema }),
  z.object({ type: z.literal(ClientMessageType.WatchLobbies), mode: OnlineModeSchema.nullable() }),
  z.object({ type: z.literal(ClientMessageType.CreateLobby), mode: OnlineModeSchema, roomId: RoomIdSchema, options: LobbyOptionsSchema, character: CharacterSchema }),
  z.object({ type: z.literal(ClientMessageType.JoinLobby), lobbyId: LobbyIdSchema, character: CharacterSchema }),
  z.object({ type: z.literal(ClientMessageType.JoinByCode), code: z.string().max(LOBBY_ID_MAX_LENGTH), character: CharacterSchema }),
  z.object({ type: z.literal(ClientMessageType.LeaveLobby) }),
  z.object({ type: z.literal(ClientMessageType.ConfigureLobby), roomId: RoomIdSchema, options: LobbyOptionsSchema }),
  z.object({ type: z.literal(ClientMessageType.SetCharacter), character: CharacterSchema }),
  z.object({ type: z.literal(ClientMessageType.StartGame) }),
  z.object({ type: z.literal(ClientMessageType.LeaveGame) }),
  z.object({ type: z.literal(ClientMessageType.Input), down: MaskSchema, pressed: MaskSchema, released: MaskSchema }),
  z.object({ type: z.literal(ClientMessageType.Ping), id: z.number().int().nonnegative() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ErrorReason = {
  BadMessage: 'badMessage',
  VersionMismatch: 'versionMismatch',
  NotInLobby: 'notInLobby',
  LobbyNotFound: 'lobbyNotFound',
  CodeNotFound: 'codeNotFound',
  LobbyFull: 'lobbyFull',
  LobbyLimit: 'lobbyLimit',
  NotHost: 'notHost',
  RoomUnknown: 'roomUnknown',
  AlreadyPlaying: 'alreadyPlaying',
  RateLimited: 'rateLimited',
} as const;

export type ErrorReason = (typeof ErrorReason)[keyof typeof ErrorReason];

export const LeaveReason = {
  Left: 'left',
  Closed: 'closed',
  Expired: 'expired',
} as const;

export type LeaveReason = (typeof LeaveReason)[keyof typeof LeaveReason];

export const ServerMessageType = {
  Welcome: 'welcome',
  Lobbies: 'lobbies',
  Lobby: 'lobby',
  LobbyLeft: 'lobbyLeft',
  GameStarted: 'gameStarted',
  Frame: 'frame',
  Upgrades: 'upgrades',
  GameOver: 'gameOver',
  Error: 'error',
  Pong: 'pong',
} as const;

const Point3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
const Point2Schema = z.object({ x: z.number(), y: z.number() });
const TextKeySchema = z.string().refine(isTextKey);

const TextRefSchema = z.object({
  key: TextKeySchema,
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

const HudMessageSchema = z.object({
  tone: stringEnum(MessageTone),
  text: TextRefSchema,
  tick: z.number(),
  playerIndex: z.number().int().optional(),
  names: z.record(z.string(), z.number().int()).optional(),
});

const PlayerStatusSchema = z.object({
  lifeRatio: z.number(),
  weaponShortName: TextKeySchema,
  ammo: z.number().optional(),
  visible: z.boolean(),
  respawnTicks: z.number().int().optional(),
});

const HudSchema = z.object({
  totalScore: z.number(),
  multiplier: z.number(),
  multiplierTickRatio: z.number(),
  frags: z.array(z.number()),
  deaths: z.array(z.number()),
  messages: z.array(HudMessageSchema),
  players: z.array(z.object({ playerIndex: z.number().int(), position: Point3Schema, status: PlayerStatusSchema })),
});

const CameraSchema = z.object({
  playerIndex: z.number().int(),
  rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  drawOrigin: Point2Schema,
});

const NetEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(DomainEventType.SoundRequested), sound: stringEnum(SoundId), position: Point3Schema.optional() }),
  z.object({
    type: z.literal(DomainEventType.DecalRequested),
    decal: stringEnum(DecalKind),
    symbol: z.string(),
    xPx: z.number(),
    yPx: z.number(),
    frame: z.number(),
    rotationIndex: z.number(),
    rotationCount: z.number(),
    scaleX: z.number(),
    scaleY: z.number(),
  }),
  z.object({ type: z.literal(DomainEventType.ScoreAwarded), points: z.number(), worldPosition: Point3Schema, screenPosition: Point2Schema }),
]);

const DrawEntrySchema = z.object({ thingKey: z.string(), sortFloor: z.boolean(), position: Point3Schema, visual: z.looseObject({ kind: z.string() }) });

const UpgradeEntrySchema = z.object({ index: z.number(), name: TextKeySchema, active: z.boolean(), newWeapon: z.boolean() });

const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(ServerMessageType.Welcome), clientId: z.string(), sessionId: z.string(), resumed: z.boolean() }),
  z.object({ type: z.literal(ServerMessageType.Lobbies), lobbies: z.array(LobbySummarySchema) }),
  z.object({ type: z.literal(ServerMessageType.Lobby), lobby: LobbySchema }),
  z.object({ type: z.literal(ServerMessageType.LobbyLeft), reason: stringEnum(LeaveReason) }),
  z.object({
    type: z.literal(ServerMessageType.GameStarted),
    matchId: z.string(),
    lobbyId: LobbyIdSchema,
    mode: OnlineModeSchema,
    roomId: RoomIdSchema,
    options: LobbyOptionsSchema,
    playerIndex: z.number().int().min(0).lt(MAX_LOBBY_PLAYERS),
    ticksPerSecond: z.number().positive(),
    projectionFactor: z.number(),
  }),
  z.object({
    type: z.literal(ServerMessageType.Frame),
    tick: z.number().int(),
    brightness: z.number(),
    camera: CameraSchema,
    entries: z.array(DrawEntrySchema),
    hud: HudSchema,
    events: z.array(NetEventSchema),
  }),
  z.object({ type: z.literal(ServerMessageType.Upgrades), upgrades: z.array(UpgradeEntrySchema) }),
  z.object({
    type: z.literal(ServerMessageType.GameOver),
    matchId: z.string(),
    state: stringEnum(CompletionState),
    winnerName: NameSchema.nullable(),
    score: z.number(),
  }),
  z.object({ type: z.literal(ServerMessageType.Error), reason: stringEnum(ErrorReason) }),
  z.object({ type: z.literal(ServerMessageType.Pong), id: z.number().int() }),
]);

type ParsedServerMessage = z.infer<typeof ServerMessageSchema>;

export type NetEvent = SoundRequested | DecalRequested | ScoreAwarded;

export interface NetHud {
  readonly totalScore: number;
  readonly multiplier: number;
  readonly multiplierTickRatio: number;
  readonly frags: readonly number[];
  readonly deaths: readonly number[];
  readonly messages: readonly HudMessageEntry[];
  readonly players: readonly { readonly playerIndex: number; readonly position: { x: number; y: number; z: number }; readonly status: PlayerHudStatus }[];
}

export interface NetFrame {
  readonly type: typeof ServerMessageType.Frame;
  readonly tick: number;
  readonly brightness: number;
  readonly camera: CameraView;
  readonly entries: readonly DrawEntry[];
  readonly hud: NetHud;
  readonly events: readonly NetEvent[];
}

export type GameStarted = Extract<ParsedServerMessage, { type: typeof ServerMessageType.GameStarted }>;
export type GameOver = Extract<ParsedServerMessage, { type: typeof ServerMessageType.GameOver }>;

export type ServerMessage =
  | Exclude<ParsedServerMessage, { type: typeof ServerMessageType.Frame | typeof ServerMessageType.Upgrades }>
  | NetFrame
  | { readonly type: typeof ServerMessageType.Upgrades; readonly upgrades: readonly MultiplierListEntry[] };

function roundFraction(_key: string, value: unknown): unknown {
  if (typeof value !== 'number' || Number.isInteger(value)) return value;
  return Math.round(value * FRACTION_DIGITS_SCALE) / FRACTION_DIGITS_SCALE;
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message, roundFraction);
}

export function encodeClientMessage(message: ClientMessage): string {
  return JSON.stringify(message);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function decodeClientMessage(text: string): ClientMessage | undefined {
  const parsed = ClientMessageSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : undefined;
}

export function parseServerMessage(value: unknown): ServerMessage | undefined {
  const parsed = ServerMessageSchema.safeParse(value);
  return parsed.success ? (parsed.data as ServerMessage) : undefined;
}

export function decodeServerMessage(text: string): ServerMessage | undefined {
  return parseServerMessage(parseJson(text));
}

export { PROTOCOL_VERSION };
