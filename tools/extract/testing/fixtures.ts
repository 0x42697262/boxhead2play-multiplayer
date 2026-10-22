import { IDENTITY_MATRIX } from '../swf/geometry.ts';
import { SwfIndex } from '../swf/swfIndex.ts';
import type {
  CharacterDefinition,
  ControlTag,
  PlaceTag,
  ShapeDefinition,
  SpriteDefinition,
  TwipsMatrix,
  TwipsRect,
} from '../swf/types.ts';

export const TWIPS = 20;

export function px(value: number): number {
  return value * TWIPS;
}

export function rect(xMin: number, yMin: number, xMax: number, yMax: number): TwipsRect {
  return { xMin: px(xMin), yMin: px(yMin), xMax: px(xMax), yMax: px(yMax) };
}

export function translate(x: number, y: number): TwipsMatrix {
  return { ...IDENTITY_MATRIX, tx: px(x), ty: px(y) };
}

export function matrix(a: number, b: number, c: number, d: number, x: number, y: number): TwipsMatrix {
  return { a, b, c, d, tx: px(x), ty: px(y) };
}

export function shape(id: number, bounds: TwipsRect): ShapeDefinition {
  return { kind: 'shape', id, bounds, tagType: 'DefineShapeTag' };
}

export function place(depth: number, characterId: number, options: Partial<Omit<PlaceTag, 'kind' | 'depth'>> = {}): PlaceTag {
  return { kind: 'place', depth, characterId, move: false, hasClipActions: false, matrix: IDENTITY_MATRIX, ...options };
}

export function move(depth: number, options: Partial<Omit<PlaceTag, 'kind' | 'depth' | 'move'>> = {}): PlaceTag {
  return { kind: 'place', depth, move: true, hasClipActions: false, ...options };
}

export const SHOW_FRAME: ControlTag = { kind: 'showFrame' };

export function sprite(id: number, tags: readonly ControlTag[]): SpriteDefinition {
  return { kind: 'sprite', id, frameCount: tags.filter((tag) => tag.kind === 'showFrame').length, tags };
}

export function swfIndex(characters: readonly CharacterDefinition[], exports: Readonly<Record<string, number>> = {}): SwfIndex {
  return new SwfIndex({
    generator: 'test',
    version: 8,
    frameRate: 25,
    stageBounds: rect(0, 0, 640, 480),
    characters: new Map(characters.map((definition) => [definition.id, definition])),
    exports: new Map(Object.entries(exports)),
    root: sprite(0, [SHOW_FRAME]),
  });
}
