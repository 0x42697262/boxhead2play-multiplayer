import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/adapters/storage/KeyValueStore.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { Difficulty, PlayerCharacter } from '../../src/domain/world/SimulationSettings.ts';
import { silentLogger } from '../../src/observability/logger.ts';
import { GraphicsQuality } from '../../src/services/graphicsQuality.ts';
import {
  DEFAULT_KEYS,
  DEFAULT_SETTINGS,
  levelIndexFor,
  ORIGINAL_KEYS,
  readSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  SettingsService,
  toGameOptions,
  toLobbyOptions,
  withLevelIndex,
} from '../../src/services/SettingsService.ts';

describe('settings reading', () => {
  it('uses the CSaveData defaults when nothing is stored', () => {
    const { settings } = readSettings(undefined);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.levelIndex.single).toBe(8);
    expect(settings.character).toBe(PlayerCharacter.Bambo);
    expect(settings.playerName).toBe('');
  });

  it('migrates an unversioned SharedObject-style blob', () => {
    const legacy = { mSoundActive: false, mDevilsActive: 0, mDifficulty: 2, mPlayer1_KeyShoot: 32, mLevelIndex_Coop: 4 };
    const result = readSettings(JSON.stringify(legacy));
    expect(result.migratedFrom).toBe(0);
    expect(result.settings.version).toBe(SETTINGS_VERSION);
    expect(result.settings.soundVolume).toBe(0);
    expect(result.settings.devilsActive).toBe(false);
    expect(result.settings.difficulty).toBe(Difficulty.Expert);
    expect(result.settings.keys.fire).toBe(32);
    expect(result.settings.keys.up).toBe(ORIGINAL_KEYS.up);
    expect(result.settings.levelIndex.coop).toBe(4);
  });

  it('migrates version 1 (local two player) to one character, one key set and an empty name', () => {
    const v1 = {
      ...DEFAULT_SETTINGS,
      version: 1,
      character: undefined,
      playerName: undefined,
      characters: [PlayerCharacter.GiJoe, PlayerCharacter.Swat],
      keys: { player1: { ...DEFAULT_SETTINGS.keys, fire: 70 }, player2: DEFAULT_SETTINGS.keys },
      viewSideDeathMatch: 0,
      difficulty: Difficulty.Expert,
    };
    const result = readSettings(JSON.stringify(v1));
    expect(result.migratedFrom).toBe(1);
    expect(result.rejected).toBeUndefined();
    expect(result.settings).toEqual({ ...DEFAULT_SETTINGS, character: PlayerCharacter.GiJoe, keys: { ...DEFAULT_SETTINGS.keys, fire: 70 }, difficulty: Difficulty.Expert });
  });

  it('migrates version 2 to a sound volume (on = full, off = 0) and sharp graphics', () => {
    const v2: Record<string, unknown> = { ...DEFAULT_SETTINGS, version: 2, soundActive: false, difficulty: Difficulty.Expert };
    delete v2.soundVolume;
    delete v2.graphics;
    const result = readSettings(JSON.stringify(v2));
    expect(result.migratedFrom).toBe(2);
    expect(result.settings).toEqual({ ...DEFAULT_SETTINGS, soundVolume: 0, difficulty: Difficulty.Expert });
    expect(readSettings(JSON.stringify({ ...v2, soundActive: true })).settings).toMatchObject({ soundVolume: 100, graphics: GraphicsQuality.Sharp });
  });

  it('migrates version 3 with the original arrow keys to WASD, and keeps rebound keys', () => {
    const v3 = { ...DEFAULT_SETTINGS, version: 3, keys: ORIGINAL_KEYS };
    expect(readSettings(JSON.stringify(v3)).settings.keys).toEqual(DEFAULT_KEYS);
    const rebound = { ...ORIGINAL_KEYS, fire: 70 };
    expect(readSettings(JSON.stringify({ ...v3, keys: rebound })).settings.keys).toEqual(rebound);
  });

  it('rejects invalid JSON, invalid values and future versions', () => {
    expect(readSettings('{').rejected).toBe('json');
    expect(readSettings(JSON.stringify({ ...DEFAULT_SETTINGS, difficulty: 7 })).rejected).toBeDefined();
    expect(readSettings(JSON.stringify({ ...DEFAULT_SETTINGS, version: 99 })).rejected).toBeDefined();
    expect(readSettings('[]').settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('SettingsService', () => {
  it('persists updates as versioned JSON and notifies listeners', () => {
    const store = new MemoryStore();
    const service = new SettingsService(store, silentLogger);
    const seen: number[] = [];
    service.subscribe((settings) => seen.push(settings.soundVolume));
    service.update((settings) => ({ ...settings, soundVolume: 25 }));
    expect(seen).toEqual([25]);
    const stored = JSON.parse(store.read(SETTINGS_STORAGE_KEY) ?? '{}') as { version: number; soundVolume: number };
    expect(stored).toMatchObject({ version: SETTINGS_VERSION, soundVolume: 25 });
    expect(new SettingsService(store, silentLogger).settings.soundVolume).toBe(25);
  });

  it('refuses an update that fails validation', () => {
    const service = new SettingsService(new MemoryStore(), silentLogger);
    service.update((settings) => ({ ...settings, gameSpeed: 5 as never }));
    expect(service.settings.gameSpeed).toBe(DEFAULT_SETTINGS.gameSpeed);
  });

  it('writes a migrated blob back on load', () => {
    const store = new MemoryStore();
    store.write(SETTINGS_STORAGE_KEY, JSON.stringify({ mDetail: false }));
    new SettingsService(store, silentLogger);
    expect(JSON.parse(store.read(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({ version: SETTINGS_VERSION, detail: false });
  });

  it('maps settings to game options and level indices per mode', () => {
    const settings = withLevelIndex(DEFAULT_SETTINGS, GameMode.DeathMatch, 3);
    expect(levelIndexFor(settings, GameMode.DeathMatch)).toBe(3);
    expect(levelIndexFor(settings, GameMode.Single)).toBe(8);
    expect(toGameOptions(settings, GameMode.Coop)).toMatchObject({ gameMode: GameMode.Coop, playerCharacters: [3], detail: true });
    expect(toLobbyOptions(settings)).toEqual({ difficulty: 0, gameSpeed: 1, devilsActive: true, collisionsActive: true, damageActive: true, gameAmount: 1, detail: true });
  });
});
