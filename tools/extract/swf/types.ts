export interface TwipsMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

export interface TwipsRect {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
}

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ColorTransform {
  readonly rMult: number;
  readonly gMult: number;
  readonly bMult: number;
  readonly aMult: number;
  readonly rAdd: number;
  readonly gAdd: number;
  readonly bAdd: number;
  readonly aAdd: number;
}

export type FilterValue = number | boolean | string | Rgba | readonly FilterValue[];

export interface Filter {
  readonly type: string;
  readonly [property: string]: FilterValue;
}

export interface PlaceTag {
  readonly kind: 'place';
  readonly depth: number;
  readonly move: boolean;
  readonly characterId?: number;
  readonly matrix?: TwipsMatrix;
  readonly colorTransform?: ColorTransform;
  readonly name?: string;
  readonly ratio?: number;
  readonly clipDepth?: number;
  readonly filters?: readonly Filter[];
  readonly blendMode?: number;
  readonly visible?: boolean;
  readonly hasClipActions: boolean;
}

export interface RemoveTag {
  readonly kind: 'remove';
  readonly depth: number;
}

export interface ShowFrameTag {
  readonly kind: 'showFrame';
}

export interface FrameLabelTag {
  readonly kind: 'label';
  readonly name: string;
}

export interface StartSoundTag {
  readonly kind: 'startSound';
  readonly soundId: number;
  readonly syncStop: boolean;
  readonly syncNoMultiple: boolean;
  readonly loopCount?: number;
}

export interface ActionTag {
  readonly kind: 'action';
}

export type ControlTag = PlaceTag | RemoveTag | ShowFrameTag | FrameLabelTag | StartSoundTag | ActionTag;

export interface ShapeDefinition {
  readonly kind: 'shape';
  readonly id: number;
  readonly bounds: TwipsRect;
  readonly tagType: string;
}

export interface MorphFill {
  readonly start: Rgba;
  readonly end: Rgba;
  readonly fillStyleType: number;
}

export interface MorphLine {
  readonly startWidth: number;
  readonly endWidth: number;
  readonly start: Rgba;
  readonly end: Rgba;
}

export interface MorphShapeDefinition {
  readonly kind: 'morphShape';
  readonly id: number;
  readonly startBounds: TwipsRect;
  readonly endBounds: TwipsRect;
  readonly fills: readonly MorphFill[];
  readonly lines: readonly MorphLine[];
}

export interface TextRecord {
  readonly fontId?: number;
  readonly color?: Rgba;
  readonly height?: number;
  readonly xOffset?: number;
  readonly yOffset?: number;
  readonly glyphIndices: readonly number[];
  readonly glyphAdvances: readonly number[];
}

export interface TextDefinition {
  readonly kind: 'text';
  readonly id: number;
  readonly bounds: TwipsRect;
  readonly matrix: TwipsMatrix;
  readonly records: readonly TextRecord[];
}

export interface EditTextDefinition {
  readonly kind: 'editText';
  readonly id: number;
  readonly bounds: TwipsRect;
  readonly variableName: string;
  readonly fontId?: number;
  readonly fontHeight?: number;
  readonly color?: Rgba;
  readonly align?: number;
  readonly leftMargin?: number;
  readonly rightMargin?: number;
  readonly indent?: number;
  readonly leading?: number;
  readonly maxLength?: number;
  readonly initialText?: string;
  readonly flags: Readonly<Record<string, boolean>>;
}

export interface ButtonRecord {
  readonly characterId: number;
  readonly depth: number;
  readonly matrix: TwipsMatrix;
  readonly colorTransform?: ColorTransform;
  readonly filters?: readonly Filter[];
  readonly blendMode?: number;
  readonly states: readonly string[];
}

export interface ButtonDefinition {
  readonly kind: 'button';
  readonly id: number;
  readonly trackAsMenu: boolean;
  readonly records: readonly ButtonRecord[];
  readonly conditions: readonly (readonly string[])[];
}

export interface SpriteDefinition {
  readonly kind: 'sprite';
  readonly id: number;
  readonly frameCount: number;
  readonly tags: readonly ControlTag[];
}

export interface FontDefinition {
  readonly kind: 'font';
  readonly id: number;
  readonly name: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly codeTable: readonly number[];
}

export interface SoundDefinition {
  readonly kind: 'sound';
  readonly id: number;
  readonly format: number;
  readonly rate: number;
  readonly is16Bit: boolean;
  readonly stereo: boolean;
  readonly sampleCount: number;
}

export interface BitmapDefinition {
  readonly kind: 'bitmap';
  readonly id: number;
  readonly tagType: string;
}

export type CharacterDefinition =
  | ShapeDefinition
  | MorphShapeDefinition
  | TextDefinition
  | EditTextDefinition
  | ButtonDefinition
  | SpriteDefinition
  | FontDefinition
  | SoundDefinition
  | BitmapDefinition;

export interface SwfDocument {
  readonly generator: string;
  readonly version: number;
  readonly frameRate: number;
  readonly stageBounds: TwipsRect;
  readonly characters: ReadonlyMap<number, CharacterDefinition>;
  readonly exports: ReadonlyMap<string, number>;
  readonly root: SpriteDefinition;
}
