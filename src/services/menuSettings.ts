import type { PlayerKeyCodes } from '../adapters/input/TickInputSampler.ts';
import { Difficulty, GameAmount, GameSpeed, type PlayerCharacter } from '../domain/world/SimulationSettings.ts';
import { DEFAULT_PLAYER1_KEYS, DEFAULT_PLAYER2_KEYS, type UserSettings } from './SettingsService.ts';

export const OptionField = {
  Difficulty: 'difficulty',
  GameSpeed: 'gameSpeed',
  Devils: 'devilsActive',
  Collisions: 'collisionsActive',
  Damage: 'damageActive',
  GameAmount: 'gameAmount',
} as const;

export type OptionField = (typeof OptionField)[keyof typeof OptionField];

export const OPTION_OFF = 0;
export const OPTION_ON = 1;

const BOOLEAN_FIELDS: ReadonlySet<OptionField> = new Set([OptionField.Devils, OptionField.Collisions, OptionField.Damage]);

export const RESET_OPTIONS: Readonly<Record<OptionField, number>> = {
  [OptionField.Difficulty]: Difficulty.Beginner,
  [OptionField.GameSpeed]: GameSpeed.Normal,
  [OptionField.Devils]: OPTION_ON,
  [OptionField.Collisions]: OPTION_ON,
  [OptionField.Damage]: OPTION_ON,
  [OptionField.GameAmount]: GameAmount.Kills10,
};

export function optionValue(settings: UserSettings, field: OptionField): number {
  const value = settings[field];
  if (typeof value === 'boolean') return value ? OPTION_ON : OPTION_OFF;
  return value;
}

export function withOption(settings: UserSettings, field: OptionField, value: number): UserSettings {
  return { ...settings, [field]: BOOLEAN_FIELDS.has(field) ? value === OPTION_ON : value };
}

export function resetOptions(settings: UserSettings): UserSettings {
  let next = settings;
  for (const field of Object.values(OptionField)) next = withOption(next, field, RESET_OPTIONS[field]);
  return next;
}

export const PlayerSlot = {
  First: 0,
  Second: 1,
} as const;

export type PlayerSlot = (typeof PlayerSlot)[keyof typeof PlayerSlot];

export function withCharacter(settings: UserSettings, slot: PlayerSlot, character: PlayerCharacter): UserSettings {
  const characters: UserSettings['characters'] = slot === PlayerSlot.First ? [character, settings.characters[1]] : [settings.characters[0], character];
  return { ...settings, characters };
}

export type KeyField = keyof PlayerKeyCodes;

export function playerKeys(settings: UserSettings, slot: PlayerSlot): PlayerKeyCodes {
  return slot === PlayerSlot.First ? settings.keys.player1 : settings.keys.player2;
}

export function withKey(settings: UserSettings, slot: PlayerSlot, field: KeyField, keyCode: number): UserSettings {
  const keys = { ...playerKeys(settings, slot), [field]: keyCode };
  return { ...settings, keys: slot === PlayerSlot.First ? { ...settings.keys, player1: keys } : { ...settings.keys, player2: keys } };
}

export function resetKeys(settings: UserSettings): UserSettings {
  return { ...settings, keys: { player1: DEFAULT_PLAYER1_KEYS, player2: DEFAULT_PLAYER2_KEYS } };
}
