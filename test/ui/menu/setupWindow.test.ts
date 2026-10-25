import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../../src/adapters/storage/KeyValueStore.ts';
import { silentLogger } from '../../../src/observability/logger.ts';
import { GraphicsQuality } from '../../../src/services/graphicsQuality.ts';
import { RoomDetail } from '../../../src/services/roomDetail.ts';
import { effectPreferences, soundGain } from '../../../src/services/menuSettings.ts';
import { SettingsService } from '../../../src/services/SettingsService.ts';
import { applySetupAction, SetupAction, SetupOutcome } from '../../../src/ui/screens/menu/SetupWindow.ts';

describe('SETTINGS window actions', () => {
  it('stores graphics and volume, resets to sharp and full, and closes', () => {
    const settings = new SettingsService(new MemoryStore(), silentLogger);
    expect(applySetupAction(settings, { kind: SetupAction.Graphics, value: GraphicsQuality.Pixelated })).toBe(SetupOutcome.Open);
    expect(applySetupAction(settings, { kind: SetupAction.Volume, value: 25 })).toBe(SetupOutcome.Open);
    expect(settings.settings).toMatchObject({ graphics: GraphicsQuality.Pixelated, soundVolume: 25 });
    expect(soundGain(settings.settings)).toBe(0.25);
    applySetupAction(settings, { kind: SetupAction.Reset });
    expect(settings.settings).toMatchObject({ graphics: GraphicsQuality.Sharp, soundVolume: 100 });
    expect(applySetupAction(settings, { kind: SetupAction.Close })).toBe(SetupOutcome.Closed);
  });

  it('stores the room detail and resets it to AUTO', () => {
    const settings = new SettingsService(new MemoryStore(), silentLogger);
    expect(settings.settings.roomDetail).toBe(RoomDetail.Auto);
    applySetupAction(settings, { kind: SetupAction.RoomDetail, value: RoomDetail.Low });
    expect(settings.settings.roomDetail).toBe(RoomDetail.Low);
    applySetupAction(settings, { kind: SetupAction.Reset });
    expect(settings.settings.roomDetail).toBe(RoomDetail.Auto);
  });

  it('switches the explosion flashes off and resets them to on', () => {
    const settings = new SettingsService(new MemoryStore(), silentLogger);
    expect(settings.settings.flashes).toBe(true);
    applySetupAction(settings, { kind: SetupAction.Flashes, value: false });
    expect(effectPreferences(settings.settings).flashes).toBe(false);
    applySetupAction(settings, { kind: SetupAction.Reset });
    expect(settings.settings.flashes).toBe(true);
  });
});
