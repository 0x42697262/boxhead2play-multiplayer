import { DEVIL_COLLECTION, PLAYER_COLLECTION, ZOMBIE_COLLECTION } from '../../../domain/things/creatures/characterCollections.ts';
import { CHARACTER_STYLE_SCALES, CharacterStyle, PLAYER_CHARACTER_STYLES } from '../../../domain/visuals.ts';
import type { GameOptions } from '../../../domain/world/SimulationSettings.ts';
import type { StyleCollection } from './XsiFrameCache.ts';

function collection(style: CharacterStyle, sets: Readonly<Record<string, string>>): StyleCollection {
  return { style, styleScale: CHARACTER_STYLE_SCALES[style], setIds: [...new Set(Object.values(sets))] };
}

export function prewarmCollections(options: GameOptions): StyleCollection[] {
  const players = options.playerCharacters.map((character) => PLAYER_CHARACTER_STYLES[character] ?? CharacterStyle.Swat);
  return [
    ...[...new Set(players)].map((style) => collection(style, PLAYER_COLLECTION)),
    collection(CharacterStyle.Devil, DEVIL_COLLECTION),
    collection(CharacterStyle.Zombie, ZOMBIE_COLLECTION),
  ];
}
