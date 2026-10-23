import type { CharacterStyle } from '../../../domain/visuals.ts';
import type { XsiCatalog, XsiMaterial } from '../../assets/schemas.ts';
import { XSI_DEFAULT_ANIMATION_SET } from '../tuning.ts';

export interface StyleModel {
  readonly visible: boolean;
  readonly groupRemap?: string;
}

export interface StyleSheet {
  readonly id: string;
  readonly style: CharacterStyle;
  readonly groupRemap?: string;
  readonly models: Readonly<Record<string, StyleModel>>;
  readonly materials: Readonly<Record<string, XsiMaterial>>;
  readonly scale: number;
}

interface StyleRecipe {
  readonly id: string;
  readonly hiddenModels: readonly string[];
  readonly groupRemap?: string;
  readonly remappedModels: readonly string[];
  readonly textures: Readonly<Record<string, string>>;
  readonly colors: Readonly<Record<string, number>>;
}

const RED = 0xff0000;
const PEACH = 0xffcc99;
const BLACK = 0x000000;
const NAVY = 0x000033;
const KHAKI = 0xdeccaa;
const STEEL_BLUE = 0xb0c4de;
const WHITE = 0xffffff;

const PLAYER_HIDDEN = ['GunPosition_Right', 'Body_Front', 'Body_Back'] as const;
const ENEMY_HIDDEN = ['Weapon_Right', 'GunPosition_Right', 'Body_Front', 'Body_Back'] as const;
const ALTERNATE_GROUP = 'Player_Alternate1';
const ALTERNATE_MODELS = ['Head', 'Foot_Right', 'Foot_Left'] as const;
const HEAD_MODEL = ['Head'] as const;

function fullTextures(prefix: string): Record<string, string> {
  const parts = ['Body_Back', 'Body_Front', 'Body_Side', 'Body_Top', 'Head_Back', 'Head_Front', 'Head_Side'];
  return Object.fromEntries(parts.map((part) => [part, `${prefix}_${part}`]));
}

function bodyTextures(prefix: string): Record<string, string> {
  const parts = ['Body_Back', 'Body_Front', 'Body_Side', 'Body_Top'];
  return Object.fromEntries(parts.map((part) => [part, `${prefix}_${part}`]));
}

export const STYLE_RECIPES: Readonly<Record<CharacterStyle, StyleRecipe>> = {
  bambo: {
    id: 'SS_BAMBO',
    hiddenModels: PLAYER_HIDDEN,
    remappedModels: [],
    textures: fullTextures('Bambo'),
    colors: { Bandana: RED, LowerArm: PEACH, UpperArm: PEACH, Hand: BLACK, Hair: BLACK },
  },
  bond: {
    id: 'SS_BOND',
    hiddenModels: PLAYER_HIDDEN,
    remappedModels: [],
    textures: fullTextures('Bond'),
    colors: { Bandana: NAVY, Cloth: NAVY, LowerArm: NAVY, UpperArm: NAVY, Hand: BLACK, Hair: BLACK },
  },
  giJoe: {
    id: 'SS_GIJOE',
    hiddenModels: PLAYER_HIDDEN,
    groupRemap: ALTERNATE_GROUP,
    remappedModels: ALTERNATE_MODELS,
    textures: fullTextures('GIJOE'),
    colors: { Hair: BLACK, Bandana: KHAKI, Cloth: KHAKI, LowerArm: KHAKI, UpperArm: KHAKI, Hand: PEACH },
  },
  swat: {
    id: 'SS_SWAT',
    hiddenModels: PLAYER_HIDDEN,
    groupRemap: ALTERNATE_GROUP,
    remappedModels: ALTERNATE_MODELS,
    textures: fullTextures('Swat'),
    colors: { Bandana: NAVY, Cloth: NAVY, LowerArm: NAVY, UpperArm: NAVY, Hand: BLACK },
  },
  zombie: {
    id: 'SS_ZOMBIE',
    hiddenModels: ENEMY_HIDDEN,
    groupRemap: 'Zombie',
    remappedModels: HEAD_MODEL,
    textures: bodyTextures('Zombie'),
    colors: { Bandana: STEEL_BLUE, LowerArm: STEEL_BLUE, UpperArm: WHITE, Hand: STEEL_BLUE },
  },
  devil: {
    id: 'SS_DEVIL',
    hiddenModels: ENEMY_HIDDEN,
    groupRemap: 'Devil',
    remappedModels: HEAD_MODEL,
    textures: bodyTextures('Devil'),
    colors: { Bandana: RED, LowerArm: RED, UpperArm: RED, Hand: BLACK, Foot: BLACK },
  },
};

export function styleModelNames(xsi: XsiCatalog): string[] {
  return Object.keys(xsi.sets[XSI_DEFAULT_ANIMATION_SET]?.directions[0]?.[0]?.Models ?? {});
}

export function buildStyleSheet(style: CharacterStyle, xsi: XsiCatalog, scale: number): StyleSheet {
  const recipe = STYLE_RECIPES[style];
  const models: Record<string, StyleModel> = {};
  for (const name of styleModelNames(xsi)) {
    const visible = !recipe.hiddenModels.includes(name);
    const remap = recipe.groupRemap !== undefined && recipe.remappedModels.includes(name);
    models[name] = remap && recipe.groupRemap !== undefined ? { visible, groupRemap: recipe.groupRemap } : { visible };
  }
  const materials: Record<string, XsiMaterial> = {};
  for (const [name, material] of Object.entries(xsi.materials)) {
    const linkage = recipe.textures[name];
    const color = recipe.colors[name];
    materials[name] = {
      ...material,
      ...(linkage === undefined ? {} : { mcLinkID: linkage }),
      ...(color === undefined ? {} : { mColor: color }),
    };
  }
  const base = { id: recipe.id, style, models, materials, scale };
  return recipe.groupRemap === undefined ? base : { ...base, groupRemap: recipe.groupRemap };
}

export function textureLinkage(xsi: XsiCatalog, materialName: string, material: XsiMaterial): string | undefined {
  const linkage = material.mcLinkID;
  if (linkage === undefined) return undefined;
  if (xsi.textureLinkages[linkage]?.characterId != null) return linkage;
  return xsi.materials[materialName]?.mcLinkID;
}

