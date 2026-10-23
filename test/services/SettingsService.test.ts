import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/adapters/storage/KeyValueStore.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { Difficulty, PlayerCharacter } from '../../src/domain/world/SimulationSettings.ts';
import { silentLogger } from '../../src/observability/logger.ts';
import {
  DEFAULT_SETTINGS,
  levelIndexFor,
  readSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  SettingsService,
  toGameOptions,
  withLevelIndex,
} from '../../src/services/SettingsService.ts';

describe('settings reading', () => {
  it('uses the CSaveData defaults when nothing is stored', () => {
    const { settings } = readSettings(undefined);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.levelIndex.single).toBe(8);
    expect(settings.characters).toEqual([PlayerCharacter.Bambo, PlayerCharacter.Swat]);
    expect(settings.viewSideDeathMatch).toBe(1);
  });

  it('migrates an unversioned SharedObject-style blob', () => {
    const legacy = { mSoundActive: false, mDevilsActive: 0, mDifficulty: 2, mPlayer1_KeyShoot: 32, mLevelIndex_Coop: 4 };
    const result = readSettings(JSON.stringify(legacy));
    expect(result.migratedFrom).toBe(0);
    expect(result.settings.version).toBe(SETTINGS_VERSION);
    expect(result.settings.soundActive).toBe(false);
    expect(result.settings.devilsActive).toBe(false);
    expect(result.settings.difficulty).toBe(Difficulty.Expert);
    expect(result.settings.keys.player1.fire).toBe(32);
    expect(result.settings.keys.player1.up).toBe(38);
    expect(result.settings.levelIndex.coop).toBe(4);
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
    const seen: boolean[] = [];
    service.subscribe((settings) => seen.push(settings.soundActive));
    service.update((settings) => ({ ...settings, soundActive: false }));
    expect(seen).toEqual([false]);
    const stored = JSON.parse(store.read(SETTINGS_STORAGE_KEY) ?? '{}') as { version: number; soundActive: boolean };
    expect(stored).toMatchObject({ version: SETTINGS_VERSION, soundActive: false });
    expect(new SettingsService(store, silentLogger).settings.soundActive).toBe(false);
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
    expect(toGameOptions(settings, GameMode.Coop)).toMatchObject({ gameMode: GameMode.Coop, playerCharacters: [3, 0], detail: true });
  });
});
