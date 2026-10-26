import { describe, expect, it } from 'vitest';
import { SymbolLibrary } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { gameMenuLayout, GameMenuView, nextViewOnEscape } from '../../../src/ui/screens/gameMenu/GameMenu.ts';
import { assetsMissing, assetSymbols } from '../../adapters/assets/support.ts';

describe('in-game Esc menu', () => {
  it('opens the choices, closes SETTINGS or CONTROLS back to the choices and then closes', () => {
    expect(nextViewOnEscape(GameMenuView.Closed)).toBe(GameMenuView.Choices);
    expect(nextViewOnEscape(GameMenuView.Settings)).toBe(GameMenuView.Choices);
    expect(nextViewOnEscape(GameMenuView.Controls)).toBe(GameMenuView.Choices);
    expect(nextViewOnEscape(GameMenuView.Choices)).toBe(GameMenuView.Closed);
  });

  it.skipIf(assetsMissing)('uses the four main menu slots for COPY LINK, SETTINGS, CONTROLS and QUIT, plus the options and controls windows, without the menu background', () => {
    const layout = gameMenuLayout(new SymbolLibrary(assetSymbols()));
    expect(layout.items.map((item) => item.name ?? item.depth)).toEqual(['mcSinglePlay', 'mcCoopPlay', 'mcDeathPlay', 'mcInstructions', 'mcWindow_Controls', 'mcWindow_Options']);
    expect(layout.labels.mcCoopPlay && layout.labels.mcDeathPlay && layout.labels.mcInstructions).toBeDefined();
    expect(layout.setup.volume.buttons).toHaveLength(4);
    expect(layout.controls.pressAKeyFrames).toBe(8);
    expect(layout.controls.title && layout.controls.info).toBeDefined();
  });
});
