import { describe, expect, it } from 'vitest';
import { SymbolLibrary } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { MemoryStore } from '../../../src/adapters/storage/KeyValueStore.ts';
import { SeededRng } from '../../../src/domain/math/Rng.ts';
import { silentLogger } from '../../../src/observability/logger.ts';
import { SettingsService } from '../../../src/services/SettingsService.ts';
import { GameMenu, GameMenuAction, gameMenuLayout, GameMenuView, nextViewOnEscape, type GameMenuDependencies } from '../../../src/ui/screens/gameMenu/GameMenu.ts';
import { GameMenuButton, GameMenuKey } from '../../../src/ui/screens/gameMenu/tuning.ts';
import { assetsMissing, assetSymbols } from '../../adapters/assets/support.ts';

function menuWith(endMatch: GameMenuDependencies['endMatch']): GameMenu {
  const deps = {
    shell: { canvas: { width: 1, height: 1 } },
    renderer: { library: new SymbolLibrary(assetSymbols()), createSurface: () => ({ ctx: { drawImage: () => undefined } }) },
    audio: { play: () => undefined },
    settings: new SettingsService(new MemoryStore(), silentLogger),
    rng: new SeededRng(1),
    logger: silentLogger,
    ticksPerSecond: () => 25,
    quit: () => undefined,
    ...(endMatch ? { endMatch } : {}),
  };
  return new GameMenu(deps as unknown as GameMenuDependencies);
}

const targetNames = (menu: GameMenu) => menu.targets().map((target) => target.path[0]);

describe('in-game Esc menu', () => {
  it('opens the choices, closes SETTINGS or CONTROLS back to the choices and then closes', () => {
    expect(nextViewOnEscape(GameMenuView.Closed)).toBe(GameMenuView.Choices);
    expect(nextViewOnEscape(GameMenuView.Settings)).toBe(GameMenuView.Choices);
    expect(nextViewOnEscape(GameMenuView.Controls)).toBe(GameMenuView.Choices);
    expect(nextViewOnEscape(GameMenuView.Choices)).toBe(GameMenuView.Closed);
  });

  it.skipIf(assetsMissing)('uses the four main menu slots for COPY LINK, SETTINGS, CONTROLS and QUIT, plus the options and controls windows, without the menu background', () => {
    const layout = gameMenuLayout(new SymbolLibrary(assetSymbols()));
    expect(layout.items.map((item) => item.name ?? item.depth)).toEqual(['mcSinglePlay', 'mcCoopPlay', 'mcDeathPlay', 'mcInstructions', 'mcEndMatch', 'mcWindow_Controls', 'mcWindow_Options']);
    expect(layout.labels.mcCoopPlay && layout.labels.mcDeathPlay && layout.labels.mcInstructions && layout.labels.mcEndMatch).toBeDefined();
    const endMatch = layout.items.find((item) => item.name === GameMenuButton.EndMatch);
    expect(endMatch?.matrix[5]).toBeCloseTo(359, 0);
    expect(layout.setup.volume.buttons).toHaveLength(4);
    expect(layout.controls.pressAKeyFrames).toBe(8);
    expect(layout.controls.title && layout.controls.info).toBeDefined();
  });

  it.skipIf(assetsMissing)('shows END MATCH only to the host and ends the match on the second click', () => {
    let host = false;
    let ended = 0;
    const menu = menuWith({ allowed: () => host, run: () => ended++ });
    menu.key(GameMenuKey.Toggle);
    expect(targetNames(menu)).not.toContain(GameMenuButton.EndMatch);
    host = true;
    expect(targetNames(menu)).toContain(GameMenuButton.EndMatch);
    menu.perform({ kind: GameMenuAction.EndMatch });
    expect(ended).toBe(0);
    expect(menu.view).toBe(GameMenuView.Choices);
    menu.key(GameMenuKey.Toggle);
    menu.key(GameMenuKey.Toggle);
    menu.perform({ kind: GameMenuAction.EndMatch });
    expect(ended).toBe(0);
    menu.perform({ kind: GameMenuAction.EndMatch });
    expect(ended).toBe(1);
    expect(menu.view).toBe(GameMenuView.Closed);
    expect(targetNames(menuWith(undefined))).not.toContain(GameMenuButton.EndMatch);
  });
});
