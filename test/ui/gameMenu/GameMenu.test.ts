import { describe, expect, it } from 'vitest';
import { SymbolLibrary } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { gameMenuLayout, GameMenuView, nextViewOnEscape } from '../../../src/ui/screens/gameMenu/GameMenu.ts';
import { assetsMissing, assetSymbols } from '../../adapters/assets/support.ts';

describe('in-game Esc menu', () => {
  it('opens the choices, closes SETTINGS back to the choices and then closes', () => {
    expect(nextViewOnEscape(GameMenuView.Closed)).toBe(GameMenuView.Choices);
    expect(nextViewOnEscape(GameMenuView.Settings)).toBe(GameMenuView.Choices);
    expect(nextViewOnEscape(GameMenuView.Choices)).toBe(GameMenuView.Closed);
  });

  it.skipIf(assetsMissing)('uses the SINGLE, COOP and DEATH MATCH slots for COPY LINK, SETTINGS and QUIT, plus the options window, without the menu background', () => {
    const layout = gameMenuLayout(new SymbolLibrary(assetSymbols()));
    expect(layout.items.map((item) => item.name ?? item.depth)).toEqual(['mcSinglePlay', 'mcCoopPlay', 'mcDeathPlay', 'mcWindow_Options']);
    expect(layout.labels.mcCoopPlay && layout.labels.mcDeathPlay).toBeDefined();
    expect(layout.setup.volume.buttons).toHaveLength(4);
  });
});
