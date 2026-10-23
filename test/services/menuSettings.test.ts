import { describe, expect, it } from 'vitest';
import { Difficulty, GameAmount, GameSpeed, PlayerCharacter } from '../../src/domain/world/SimulationSettings.ts';
import {
  OPTION_OFF,
  OPTION_ON,
  OptionField,
  optionValue,
  PlayerSlot,
  resetKeys,
  resetOptions,
  withCharacter,
  withKey,
  withOption,
} from '../../src/services/menuSettings.ts';
import { DEFAULT_PLAYER1_KEYS, DEFAULT_SETTINGS, UserSettingsSchema } from '../../src/services/SettingsService.ts';
import { OPTION_GROUPS } from '../../src/ui/screens/menu/tuning.ts';

describe('option groups to settings (RegisterButton_Option / RegisterButton_SetGroup)', () => {
  it('stores every option button value and selects exactly one button per group', () => {
    for (const group of OPTION_GROUPS) {
      for (const button of group.buttons) {
        const settings = withOption(DEFAULT_SETTINGS, group.field, button.value);
        expect(UserSettingsSchema.safeParse(settings).success).toBe(true);
        expect(group.buttons.filter((other) => optionValue(settings, group.field) === other.value)).toEqual([button]);
      }
    }
  });

  it('maps on/off buttons to booleans', () => {
    const off = withOption(DEFAULT_SETTINGS, OptionField.Devils, OPTION_OFF);
    expect(off.devilsActive).toBe(false);
    expect(optionValue(off, OptionField.Devils)).toBe(OPTION_OFF);
    expect(withOption(off, OptionField.Damage, OPTION_OFF).damageActive).toBe(false);
    expect(optionValue(DEFAULT_SETTINGS, OptionField.Collisions)).toBe(OPTION_ON);
  });

  it('resets like ResetOptions', () => {
    const changed = {
      ...DEFAULT_SETTINGS,
      difficulty: Difficulty.Nightmare,
      gameSpeed: GameSpeed.Fast,
      devilsActive: false,
      collisionsActive: false,
      damageActive: false,
      gameAmount: GameAmount.Kills50,
      soundActive: false,
    };
    const reset = resetOptions(changed);
    expect(reset).toMatchObject({
      difficulty: Difficulty.Beginner,
      gameSpeed: GameSpeed.Normal,
      devilsActive: true,
      collisionsActive: true,
      damageActive: true,
      gameAmount: GameAmount.Kills10,
      soundActive: false,
    });
  });
});

describe('characters and keys', () => {
  it('stores the character per player', () => {
    const settings = withCharacter(DEFAULT_SETTINGS, PlayerSlot.Second, PlayerCharacter.GiJoe);
    expect(settings.characters).toEqual([DEFAULT_SETTINGS.characters[0], PlayerCharacter.GiJoe]);
  });

  it('rebinds one key and resets to the ResetControls defaults', () => {
    const settings = withKey(DEFAULT_SETTINGS, PlayerSlot.First, 'left', 75);
    expect(settings.keys.player1).toEqual({ ...DEFAULT_PLAYER1_KEYS, left: 75 });
    expect(settings.keys.player2).toEqual(DEFAULT_SETTINGS.keys.player2);
    expect(resetKeys(settings).keys).toEqual(DEFAULT_SETTINGS.keys);
  });
});
