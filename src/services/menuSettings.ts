import type { PlayerKeyCodes } from '../adapters/input/TickInputSampler.ts';
import { Difficulty, GameAmount, GameSpeed, type PlayerCharacter } from '../domain/world/SimulationSettings.ts';
import type { GraphicsQuality } from './graphicsQuality.ts';
import { DEFAULT_KEYS, DEFAULT_SETTINGS, PLAYER_NAME_MAX_LENGTH, SOUND_VOLUME_MAX, type UserSettings } from './SettingsService.ts';

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

export function withCharacter(settings: UserSettings, character: PlayerCharacter): UserSettings {
  return { ...settings, character };
}

export type KeyField = keyof PlayerKeyCodes;

export function withKey(settings: UserSettings, field: KeyField, keyCode: number): UserSettings {
  return { ...settings, keys: { ...settings.keys, [field]: keyCode } };
}

export function resetKeys(settings: UserSettings): UserSettings {
  return { ...settings, keys: DEFAULT_KEYS };
}

export function withPlayerName(settings: UserSettings, name: string): UserSettings {
  return { ...settings, playerName: name.slice(0, PLAYER_NAME_MAX_LENGTH) };
}

export function withGraphics(settings: UserSettings, graphics: GraphicsQuality): UserSettings {
  return { ...settings, graphics };
}

export function withSoundVolume(settings: UserSettings, soundVolume: number): UserSettings {
  return { ...settings, soundVolume };
}

export function resetSetup(settings: UserSettings): UserSettings {
  return { ...settings, graphics: DEFAULT_SETTINGS.graphics, soundVolume: DEFAULT_SETTINGS.soundVolume };
}

export function soundGain(settings: UserSettings): number {
  return settings.soundVolume / SOUND_VOLUME_MAX;
}
