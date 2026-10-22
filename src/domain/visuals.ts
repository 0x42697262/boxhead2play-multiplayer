import type { Point2, Point3 } from './events.ts';

export const VisualKind = {
  Character: 'character',
  Clip: 'clip',
  Line: 'line',
  Square: 'square',
  Group: 'group',
} as const;

export const ClipMode = {
  Static: 'static',
  Animation: 'animation',
  Directional: 'directional',
  OmniDirectional: 'omniDirectional',
} as const;

export type ClipMode = (typeof ClipMode)[keyof typeof ClipMode];

export const VisualLayer = {
  World: 'world',
  Overlay: 'overlay',
} as const;

export type VisualLayer = (typeof VisualLayer)[keyof typeof VisualLayer];

export const CharacterStyle = {
  Swat: 'swat',
  Bond: 'bond',
  GiJoe: 'giJoe',
  Bambo: 'bambo',
  Zombie: 'zombie',
  Devil: 'devil',
} as const;

export type CharacterStyle = (typeof CharacterStyle)[keyof typeof CharacterStyle];

export const PLAYER_CHARACTER_STYLES: readonly CharacterStyle[] = [
  CharacterStyle.Swat,
  CharacterStyle.Bond,
  CharacterStyle.GiJoe,
  CharacterStyle.Bambo,
];

export const OPAQUE_ALPHA = 100;

export const DEFAULT_STYLE_SCALE = 0.35;
export const DEVIL_STYLE_SCALE = 0.42;

export const CHARACTER_STYLE_SCALES: Readonly<Record<CharacterStyle, number>> = {
  swat: DEFAULT_STYLE_SCALE,
  bond: DEFAULT_STYLE_SCALE,
  giJoe: DEFAULT_STYLE_SCALE,
  bambo: DEFAULT_STYLE_SCALE,
  zombie: DEFAULT_STYLE_SCALE,
  devil: DEVIL_STYLE_SCALE,
};

export interface CharacterVisual {
  readonly kind: typeof VisualKind.Character;
  readonly layer: typeof VisualLayer.World;
  readonly style: CharacterStyle;
  readonly styleScale: number;
  readonly animation: string;
  readonly direction: number;
  readonly directionCount: number;
  readonly frame: number;
  readonly sourceFrame: number;
  readonly alpha: number;
  readonly position: Point3;
}

export interface ClipVisual {
  readonly kind: typeof VisualKind.Clip;
  readonly layer: typeof VisualLayer.World;
  readonly mode: ClipMode;
  readonly symbol: string;
  readonly frame: number;
  readonly rotationIndex?: number;
  readonly rotationCount?: number;
  readonly angleRadians?: number;
  readonly scale: number;
  readonly alpha: number;
  readonly position: Point3;
}

export interface LineVisual {
  readonly kind: typeof VisualKind.Line;
  readonly layer: typeof VisualLayer.Overlay;
  readonly from: Point3;
  readonly to: Point3;
  readonly thickness: number;
  readonly color: number;
  readonly alpha: number;
}

export interface SquareVisual {
  readonly kind: typeof VisualKind.Square;
  readonly layer: typeof VisualLayer.Overlay;
  readonly topLeftPx: Point2;
  readonly sizePx: number;
  readonly color: number;
  readonly alpha: number;
  readonly solid: boolean;
}

export interface GroupVisual {
  readonly kind: typeof VisualKind.Group;
  readonly items: readonly Visual[];
}

export type Visual = CharacterVisual | ClipVisual | LineVisual | SquareVisual | GroupVisual;

export interface DrawEntry {
  readonly thingKey: string;
  readonly sortFloor: boolean;
  readonly position: Point3;
  readonly visual: Visual;
}
