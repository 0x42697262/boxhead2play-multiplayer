import { z } from 'zod';
import type { PlayerKeyCodes } from '../adapters/input/TickInputSampler.ts';
import type { KeyValueStore } from '../adapters/storage/KeyValueStore.ts';
import { GameMode } from '../domain/world/GameMode.ts';
import {
  Difficulty,
  GameAmount,
  GameSpeed,
  PlayerCharacter,
  type GameOptions,
} from '../domain/world/SimulationSettings.ts';
import type { LobbyOptions } from '../net/protocol.ts';
import { PLAYER_NAME_MAX_LENGTH } from '../net/tuning.ts';
import type { Logger } from '../observability/logger.ts';
import { DEFAULT_GRAPHICS_QUALITY, GraphicsQuality } from './graphicsQuality.ts';
import { DEFAULT_ROOM_DETAIL, RoomDetail } from './roomDetail.ts';
import { LogEvent } from '../text/logEvents.ts';

export const SETTINGS_STORAGE_KEY = 'boxhead2play.settings';
export const SETTINGS_VERSION = 8;
export const FRAME_RATES = [0, 30, 60, 120] as const;
export type FrameRate = (typeof FRAME_RATES)[number];
export const UNCAPPED_FRAME_RATE: FrameRate = 0;
const LEGACY_VERSION = 0;
const LOCAL_TWO_PLAYER_VERSION = 1;
const SOUND_SWITCH_VERSION = 2;
const ORIGINAL_KEYS_VERSION = 3;
const EFFECT_SWITCHES_VERSION = 4;
const FRAME_RATE_VERSION = 5;
const PING_DISPLAY_VERSION = 6;
const ROOM_DETAIL_VERSION = 7;
const LEGACY_ENABLED = 1;

export const SOUND_VOLUME_MAX = 100;
export const SOUND_VOLUME_OFF = 0;

const KEY_CODE_MIN = 0;
const KEY_CODE_MAX = 255;
export { PLAYER_NAME_MAX_LENGTH };

const keyCode = z.number().int().min(KEY_CODE_MIN).max(KEY_CODE_MAX);
const PlayerKeysSchema = z.object({
  up: keyCode,
  down: keyCode,
  left: keyCode,
  right: keyCode,
  fire: keyCode,
  nextWeapon: keyCode,
  prevWeapon: keyCode,
});

const enumValue = <T extends Record<string, number>>(values: T) =>
  z.number().int().refine((value): value is T[keyof T] => Object.values(values).includes(value));

const levelIndex = z.number().int().nonnegative();

export const UserSettingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  soundVolume: z.number().int().min(SOUND_VOLUME_OFF).max(SOUND_VOLUME_MAX),
  graphics: z.enum(Object.values(GraphicsQuality) as [GraphicsQuality, ...GraphicsQuality[]]),
  roomDetail: z.enum(Object.values(RoomDetail) as [RoomDetail, ...RoomDetail[]]),
  screenShake: z.boolean(),
  blood: z.boolean(),
  frameRate: z.number().refine((value): value is FrameRate => (FRAME_RATES as readonly number[]).includes(value)),
  showPing: z.boolean(),
  musicActive: z.boolean(),
  detail: z.boolean(),
  difficulty: enumValue(Difficulty),
  gameSpeed: enumValue(GameSpeed),
  devilsActive: z.boolean(),
  collisionsActive: z.boolean(),
  damageActive: z.boolean(),
  gameAmount: enumValue(GameAmount),
  levelIndex: z.object({ single: levelIndex, coop: levelIndex, deathMatch: levelIndex }),
  character: enumValue(PlayerCharacter),
  keys: PlayerKeysSchema,
  playerName: z.string().max(PLAYER_NAME_MAX_LENGTH),
  playCount: z.number().int().nonnegative(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

const ARROW_UP = 38;
const ARROW_DOWN = 40;
const ARROW_LEFT = 37;
const ARROW_RIGHT = 39;
const SLASH = 191;
const PERIOD = 190;
const COMMA = 188;
const KEY_W = 87;
const KEY_A = 65;
const KEY_S = 83;
const KEY_D = 68;
const KEY_E = 69;
const KEY_Q = 81;
const SPACE = 32;

export const ORIGINAL_KEYS: PlayerKeyCodes = {
  up: ARROW_UP,
  down: ARROW_DOWN,
  left: ARROW_LEFT,
  right: ARROW_RIGHT,
  fire: SLASH,
  nextWeapon: PERIOD,
  prevWeapon: COMMA,
};

export const DEFAULT_KEYS: PlayerKeyCodes = {
  up: KEY_W,
  down: KEY_S,
  left: KEY_A,
  right: KEY_D,
  fire: SPACE,
  nextWeapon: KEY_E,
  prevWeapon: KEY_Q,
};

const DEFAULT_SINGLE_LEVEL = 8;

export const DEFAULT_SETTINGS: UserSettings = {
  version: SETTINGS_VERSION,
  soundVolume: SOUND_VOLUME_MAX,
  graphics: DEFAULT_GRAPHICS_QUALITY,
  roomDetail: DEFAULT_ROOM_DETAIL,
  screenShake: true,
  blood: true,
  frameRate: UNCAPPED_FRAME_RATE,
  showPing: true,
  musicActive: true,
  detail: true,
  difficulty: Difficulty.Beginner,
  gameSpeed: GameSpeed.Normal,
  devilsActive: true,
  collisionsActive: true,
  damageActive: true,
  gameAmount: GameAmount.Kills10,
  levelIndex: { single: DEFAULT_SINGLE_LEVEL, coop: 0, deathMatch: 0 },
  character: PlayerCharacter.Bambo,
  keys: DEFAULT_KEYS,
  playerName: '',
  playCount: 0,
};

type Raw = Readonly<Record<string, unknown>>;

function pick<T>(raw: Raw, key: string, fallback: T, read: (value: unknown) => T | undefined): T {
  return read(raw[key]) ?? fallback;
}

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : typeof value === 'number' ? value === LEGACY_ENABLED : undefined);
const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

function legacyKeys(raw: Raw, prefix: string, fallback: PlayerKeyCodes): PlayerKeyCodes {
  return {
    up: pick(raw, `${prefix}_KeyMoveUp`, fallback.up, asNumber),
    down: pick(raw, `${prefix}_KeyMoveDown`, fallback.down, asNumber),
    left: pick(raw, `${prefix}_KeyMoveLeft`, fallback.left, asNumber),
    right: pick(raw, `${prefix}_KeyMoveRight`, fallback.right, asNumber),
    fire: pick(raw, `${prefix}_KeyShoot`, fallback.fire, asNumber),
    nextWeapon: pick(raw, `${prefix}_KeyNextWeapon`, fallback.nextWeapon, asNumber),
    prevWeapon: pick(raw, `${prefix}_KeyPrevWeapon`, fallback.prevWeapon, asNumber),
  };
}

export function migrateLegacy(raw: Raw): Raw {
  const d = DEFAULT_SETTINGS;
  return {
    version: LOCAL_TWO_PLAYER_VERSION,
    soundActive: pick(raw, 'mSoundActive', true, asBoolean),
    musicActive: pick(raw, 'mMusicActive', d.musicActive, asBoolean),
    detail: pick(raw, 'mDetail', d.detail, asBoolean),
    difficulty: pick(raw, 'mDifficulty', d.difficulty, asNumber),
    gameSpeed: pick(raw, 'mGameSpeed', d.gameSpeed, asNumber),
    devilsActive: pick(raw, 'mDevilsActive', d.devilsActive, asBoolean),
    collisionsActive: pick(raw, 'mCollisionsActive', d.collisionsActive, asBoolean),
    damageActive: pick(raw, 'mDamageActive', d.damageActive, asBoolean),
    gameAmount: pick(raw, 'mGameAmount', d.gameAmount, asNumber),
    levelIndex: {
      single: pick(raw, 'mLevelIndex_Single', d.levelIndex.single, asNumber),
      coop: pick(raw, 'mLevelIndex_Coop', d.levelIndex.coop, asNumber),
      deathMatch: pick(raw, 'mLevelIndex_DeathMatch', d.levelIndex.deathMatch, asNumber),
    },
    characters: [pick(raw, 'mPlayer1_CharacterIndex', d.character, asNumber)],
    keys: { player1: legacyKeys(raw, 'mPlayer1', ORIGINAL_KEYS) },
    playCount: pick(raw, 'mPlayCount', d.playCount, asNumber),
  };
}

function asRaw(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
}

const LOCAL_TWO_PLAYER_ONLY_FIELDS: ReadonlySet<string> = new Set(['characters', 'keys', 'viewSideDeathMatch']);

export function migrateLocalTwoPlayer(raw: Raw): Raw {
  const kept = Object.fromEntries(Object.entries(raw).filter(([field]) => !LOCAL_TWO_PLAYER_ONLY_FIELDS.has(field)));
  const characters = raw.characters;
  const first: unknown = Array.isArray(characters) ? characters[0] : undefined;
  return {
    ...kept,
    version: SOUND_SWITCH_VERSION,
    character: first ?? DEFAULT_SETTINGS.character,
    keys: asRaw(raw.keys).player1 ?? DEFAULT_SETTINGS.keys,
    playerName: DEFAULT_SETTINGS.playerName,
  };
}

export function migrateSoundSwitch(raw: Raw): Raw {
  const { soundActive, ...kept } = raw;
  return {
    ...kept,
    version: ORIGINAL_KEYS_VERSION,
    soundVolume: soundActive === false ? SOUND_VOLUME_OFF : DEFAULT_SETTINGS.soundVolume,
    graphics: DEFAULT_SETTINGS.graphics,
  };
}

function sameKeys(raw: unknown, keys: PlayerKeyCodes): boolean {
  const stored = asRaw(raw);
  return Object.entries(keys).every(([field, code]) => stored[field] === code);
}

export function migrateOriginalKeys(raw: Raw): Raw {
  return { ...raw, version: EFFECT_SWITCHES_VERSION, keys: sameKeys(raw.keys, ORIGINAL_KEYS) ? DEFAULT_KEYS : raw.keys };
}

export function migrateEffectSwitches(raw: Raw): Raw {
  return { ...raw, version: FRAME_RATE_VERSION, screenShake: DEFAULT_SETTINGS.screenShake, blood: DEFAULT_SETTINGS.blood };
}

export function migrateFrameRate(raw: Raw): Raw {
  return { ...raw, version: PING_DISPLAY_VERSION, frameRate: DEFAULT_SETTINGS.frameRate };
}

export function migratePingDisplay(raw: Raw): Raw {
  return { ...raw, version: ROOM_DETAIL_VERSION, showPing: DEFAULT_SETTINGS.showPing };
}

export function migrateRoomDetail(raw: Raw): Raw {
  return { ...raw, version: SETTINGS_VERSION, roomDetail: DEFAULT_SETTINGS.roomDetail };
}

export const MIGRATIONS: Readonly<Record<number, (raw: Raw) => Raw>> = {
  [LEGACY_VERSION]: migrateLegacy,
  [LOCAL_TWO_PLAYER_VERSION]: migrateLocalTwoPlayer,
  [SOUND_SWITCH_VERSION]: migrateSoundSwitch,
  [ORIGINAL_KEYS_VERSION]: migrateOriginalKeys,
  [EFFECT_SWITCHES_VERSION]: migrateEffectSwitches,
  [FRAME_RATE_VERSION]: migrateFrameRate,
  [PING_DISPLAY_VERSION]: migratePingDisplay,
  [ROOM_DETAIL_VERSION]: migrateRoomDetail,
};

function versionOf(raw: Raw): number {
  return typeof raw.version === 'number' ? raw.version : LEGACY_VERSION;
}

export interface SettingsReadResult {
  readonly settings: UserSettings;
  readonly migratedFrom?: number;
  readonly rejected?: string;
}

export function readSettings(text: string | undefined): SettingsReadResult {
  if (text === undefined) return { settings: DEFAULT_SETTINGS };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { settings: DEFAULT_SETTINGS, rejected: 'json' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { settings: DEFAULT_SETTINGS, rejected: 'shape' };
  let current = raw as Raw;
  const original = versionOf(current);
  while (versionOf(current) < SETTINGS_VERSION) {
    const migrate = MIGRATIONS[versionOf(current)];
    if (!migrate) return { settings: DEFAULT_SETTINGS, rejected: `version ${versionOf(current)}` };
    current = migrate(current);
  }
  const parsed = UserSettingsSchema.safeParse(current);
  if (!parsed.success) return { settings: DEFAULT_SETTINGS, rejected: parsed.error.message };
  return original === SETTINGS_VERSION ? { settings: parsed.data } : { settings: parsed.data, migratedFrom: original };
}

export function levelIndexFor(settings: UserSettings, mode: GameMode): number {
  switch (mode) {
    case GameMode.Single:
      return settings.levelIndex.single;
    case GameMode.Coop:
      return settings.levelIndex.coop;
    case GameMode.DeathMatch:
      return settings.levelIndex.deathMatch;
  }
}

export function withLevelIndex(settings: UserSettings, mode: GameMode, index: number): UserSettings {
  const key = mode === GameMode.Single ? 'single' : mode === GameMode.Coop ? 'coop' : 'deathMatch';
  return { ...settings, levelIndex: { ...settings.levelIndex, [key]: index } };
}

export function toGameOptions(settings: UserSettings, gameMode: GameMode): GameOptions {
  return {
    gameMode,
    difficulty: settings.difficulty,
    gameSpeed: settings.gameSpeed,
    devilsActive: settings.devilsActive,
    collisionsActive: settings.collisionsActive,
    damageActive: settings.damageActive,
    gameAmount: settings.gameAmount,
    playerCharacters: [settings.character],
    detail: settings.detail,
  };
}

export function toLobbyOptions(settings: UserSettings): LobbyOptions {
  return {
    difficulty: settings.difficulty,
    gameSpeed: settings.gameSpeed,
    devilsActive: settings.devilsActive,
    collisionsActive: settings.collisionsActive,
    damageActive: settings.damageActive,
    gameAmount: settings.gameAmount,
    detail: settings.detail,
  };
}

export type SettingsListener = (settings: UserSettings) => void;

export class SettingsService {
  private current: UserSettings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger,
  ) {
    const result = readSettings(store.read(SETTINGS_STORAGE_KEY));
    this.current = result.settings;
    if (result.rejected !== undefined) logger.warn(LogEvent.SaveDataRejected, { reason: result.rejected });
    if (result.migratedFrom !== undefined) {
      logger.info(LogEvent.SaveDataMigrated, { from: result.migratedFrom, to: SETTINGS_VERSION });
      this.persist();
    }
    logger.info(LogEvent.SaveDataLoaded, { version: SETTINGS_VERSION });
  }

  get settings(): UserSettings {
    return this.current;
  }

  update(change: (settings: UserSettings) => UserSettings): UserSettings {
    const parsed = UserSettingsSchema.safeParse(change(this.current));
    if (!parsed.success) {
      this.logger.warn(LogEvent.SaveDataRejected, { reason: parsed.error.message });
      return this.current;
    }
    this.current = parsed.data;
    this.persist();
    for (const listener of this.listeners) listener(this.current);
    return this.current;
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    if (!this.store.write(SETTINGS_STORAGE_KEY, JSON.stringify(this.current))) this.logger.warn(LogEvent.SaveDataWriteFailed);
  }
}
