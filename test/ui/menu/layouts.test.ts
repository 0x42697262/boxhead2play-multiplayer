import { describe, expect, it } from 'vitest';
import { hitAreaContains, instanceHitArea } from '../../../src/adapters/render/symbols/hitTest.ts';
import { SymbolLibrary } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { mainMenuLayout } from '../../../src/ui/screens/menu/MainMenuScreen.ts';
import { selectWorldLayout } from '../../../src/ui/screens/menu/SelectWorldScreen.ts';
import { MainMenuChild, PLAY_LABEL_INSTANCE } from '../../../src/ui/screens/menu/tuning.ts';
import { assetsMissing, assetSymbols } from '../../adapters/assets/support.ts';

describe('menu layouts from the real library', () => {
  it.skipIf(assetsMissing)('main menu keeps the background, the title and two buttons, DEATH MATCH in the COOPERATIVE slot', () => {
    const library = new SymbolLibrary(assetSymbols());
    const layout = mainMenuLayout(library);
    expect(layout.items.map((item) => item.depth)).toEqual([1, 8, 10, 82]);
    const coop = library.findChild(library.characterId('Screen_Main') ?? 0, MainMenuChild.CoopPlay);
    const death = layout.items.find((item) => item.name === MainMenuChild.DeathPlay);
    expect(death?.matrix).toEqual(coop?.matrix);
    expect(layout.playLabel?.attach?.[0]?.name).toBe(PLAY_LABEL_INSTANCE);
    expect(layout.playLabel?.children?.[PLAY_LABEL_INSTANCE]?.clip?.xMin).toBeCloseTo(124.9);
    const play = instanceHitArea(library, layout.items, [MainMenuChild.SinglePlay], {});
    const deathArea = instanceHitArea(library, layout.items, [MainMenuChild.DeathPlay], {});
    expect(play && hitAreaContains(play, { x: 320, y: 226 })).toBe(true);
    expect(deathArea && hitAreaContains(deathArea, { x: 320, y: 259 })).toBe(true);
    expect(deathArea && hitAreaContains(deathArea, { x: 320, y: 292 })).toBe(false);
  });

  it.skipIf(assetsMissing)('select world drops the external links and finds 18 levels, 4 characters and the 8-frame key prompt', () => {
    const library = new SymbolLibrary(assetSymbols());
    for (const mode of [GameMode.Single, GameMode.DeathMatch]) {
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
