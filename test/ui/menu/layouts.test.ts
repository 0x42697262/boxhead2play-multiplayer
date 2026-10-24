import { describe, expect, it } from 'vitest';
import { hitAreaContains, instanceHitArea } from '../../../src/adapters/render/symbols/hitTest.ts';
import { ButtonState, SymbolLibrary } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { DEFAULT_SETTINGS } from '../../../src/services/SettingsService.ts';
import { OverrideTree } from '../../../src/ui/screens/menu/overrideTree.ts';
import { SetupWindow } from '../../../src/ui/screens/menu/SetupWindow.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { mainMenuLayout } from '../../../src/ui/screens/menu/MainMenuScreen.ts';
import { selectWorldLayout } from '../../../src/ui/screens/menu/SelectWorldScreen.ts';
import { JOIN_CODE_BUTTON, MainMenuChild, NAME_BUTTON } from '../../../src/ui/screens/menu/tuning.ts';
import { onlineMenuLayout } from '../../../src/ui/screens/online/OnlineMenuScreen.ts';
import { OnlineMenuChild } from '../../../src/ui/screens/online/tuning.ts';
import { assetsMissing, assetSymbols } from '../../adapters/assets/support.ts';

describe('menu layouts from the real library', () => {
  it.skipIf(assetsMissing)('main menu keeps the background, the title, the mode buttons, SETTINGS in the INSTRUCTIONS slot and the options window', () => {
    const library = new SymbolLibrary(assetSymbols());
    const layout = mainMenuLayout(library);
    expect(layout.items.map((item) => item.depth)).toEqual([1, 8, 10, 12, 14, 82, 90, 91, 207]);
    expect(layout.settingsLabel).toBeDefined();
    const { graphics, roomDetail, volume, ping, hidden } = layout.setup;
    expect(graphics.buttons.map((button) => button.spec.instance)).toEqual(['_Level_Beginner', '_Level_Intermediate', '_Level_Expert']);
    for (const button of graphics.buttons) expect(button.matrix?.[5]).toBeCloseTo(-100, 0);
    for (const button of roomDetail.buttons) expect(button.matrix?.[5]).toBeCloseTo(-64, 0);
    for (const button of volume.buttons) expect(button.matrix?.[5]).toBeCloseTo(-28, 0);
    for (const button of ping.buttons) expect(button.matrix?.[5]).toBeCloseTo(116, 0);
    expect(roomDetail.buttons.map((button) => button.attached?.name)).toEqual(['setupRoomDetailAuto', 'setupRoomDetailHigh', 'setupRoomDetailLow']);
    expect(roomDetail.title && roomDetail.info).toBeDefined();
    expect(layout.setup.bottomButtons.map((button) => button.matrix[5])).toEqual([152, 152]);
    expect(ping.buttons.map((button) => button.spec.instance)).toEqual(['_Devils_Off', '_Devils_On']);
    expect(ping.title && ping.info).toBeDefined();
    expect(graphics.buttons.every((button) => button.label !== undefined)).toBe(true);
    expect(graphics.title && volume.info).toBeDefined();
    expect(hidden).not.toContain('_Devils_Off');
    expect(hidden).not.toContain('_Collide_Off');
    expect(hidden).not.toContain('_Game1');
    const play = instanceHitArea(library, layout.items, [MainMenuChild.SinglePlay], {});
    const coopArea = instanceHitArea(library, layout.items, [MainMenuChild.CoopPlay], {});
    const deathArea = instanceHitArea(library, layout.items, [MainMenuChild.DeathPlay], {});
    expect(play && hitAreaContains(play, { x: 320, y: 226 })).toBe(true);
    expect(coopArea && hitAreaContains(coopArea, { x: 320, y: 259 })).toBe(true);
    expect(deathArea && hitAreaContains(deathArea, { x: 320, y: 292 })).toBe(true);
    expect(deathArea && hitAreaContains(deathArea, { x: 320, y: 259 })).toBe(false);
  });

  it.skipIf(assetsMissing)('SETTINGS window answers clicks on the attached ROOM DETAIL buttons', () => {
    const library = new SymbolLibrary(assetSymbols());
    const layout = mainMenuLayout(library);
    const tree = new OverrideTree();
    new SetupWindow(library, layout.setup).scene(tree, true, DEFAULT_SETTINGS, () => ButtonState.Up);
    const auto = instanceHitArea(library, layout.items, [MainMenuChild.OptionsWindow, 'setupRoomDetailAuto', '_Button'], tree.overrides);
    const low = instanceHitArea(library, layout.items, [MainMenuChild.OptionsWindow, 'setupRoomDetailLow', '_Button'], tree.overrides);
    expect(auto && hitAreaContains(auto, { x: 247, y: 176 })).toBe(true);
    expect(low && hitAreaContains(low, { x: 407, y: 176 })).toBe(true);
    expect(low && hitAreaContains(low, { x: 247, y: 176 })).toBe(false);
  });

  it.skipIf(assetsMissing)('main menu puts the player NAME in the bottom-left corner and JOIN BY CODE in the bottom-right corner', () => {
    const library = new SymbolLibrary(assetSymbols());
    const layout = mainMenuLayout(library);
    const name = instanceHitArea(library, layout.items, [NAME_BUTTON.name], {});
    const code = instanceHitArea(library, layout.items, [JOIN_CODE_BUTTON.name], {});
    expect(layout.nameLabel).toBeDefined();
    expect(name && hitAreaContains(name, { x: 60, y: 452 })).toBe(true);
    expect(name && hitAreaContains(name, { x: 548, y: 452 })).toBe(false);
    expect(code && hitAreaContains(code, { x: 548, y: 452 })).toBe(true);
  });

  it.skipIf(assetsMissing)('cuts "Forfeits hiscore!" off the three option info lines', () => {
    const layout = selectWorldLayout(new SymbolLibrary(assetSymbols()), GameMode.Single);
    expect(layout.optionInfoClips.map((entry) => entry.key)).toEqual(['#20', '#36', '#52']);
    for (const { clip } of layout.optionInfoClips) expect(clip.xMax).toBeGreaterThan(200);
  });

  it.skipIf(assetsMissing)('online menu reuses the main menu slots for HOST and JOIN (no NAME) plus the back tab and the controls window with 14 join rows', () => {
    const library = new SymbolLibrary(assetSymbols());
    const layout = onlineMenuLayout(library);
    expect(layout.items.map((item) => item.name ?? item.depth)).toEqual([1, 'mcSinglePlay', 'mcCoopPlay', 74, '_Icon_Back', 82, 'mcWindow_Controls']);
    expect(layout.slots).toHaveLength(14);
    expect(layout.slots.every((slot) => slot.label !== undefined)).toBe(true);
    expect(layout.labels[OnlineMenuChild.Host]?.centerX).toBeCloseTo(11, 0);
    expect(layout.title).toBeDefined();
    const host = instanceHitArea(library, layout.items, [OnlineMenuChild.Host], {});
    expect(host && hitAreaContains(host, { x: 320, y: 226 })).toBe(true);
  });

  it.skipIf(assetsMissing)('select world drops the external links and finds 18 levels, 4 characters and the 8-frame key prompt', () => {
    const library = new SymbolLibrary(assetSymbols());
    for (const mode of [GameMode.Single, GameMode.Coop, GameMode.DeathMatch]) {
      const layout = selectWorldLayout(library, mode);
      expect(layout.items.some((item) => item.name === '_IconMoreGames' || item.name === '_STC')).toBe(false);
      expect(layout.items.some((item) => [50, 56, 60, 65].includes(item.depth))).toBe(false);
      expect(layout.levelCount).toBe(18);
      expect(layout.characterCount).toBe(4);
      expect(layout.pressAKeyFrames).toBe(8);
      expect(layout.levelIcons?.depth).toBe(7);
      expect(layout.levelIcons?.filters?.map((filter) => filter.type)).toEqual(['dropShadow', 'bevel']);
    }
  });
});
