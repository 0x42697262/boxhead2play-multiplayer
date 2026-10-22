import { COLOR_TRANSFORM_FIXED_ONE, FFDEC_XML_MAJOR_VERSION, OPAQUE_ALPHA } from '../tuning.ts';
import { child, items, type XmlElement } from '../xml/parseXml.ts';
import { IDENTITY_MATRIX, snapFixed16 } from './geometry.ts';
import type {
  ButtonDefinition,
  ButtonRecord,
  CharacterDefinition,
  ColorTransform,
  ControlTag,
  EditTextDefinition,
  Filter,
  FilterValue,
  FontDefinition,
  MorphShapeDefinition,
  PlaceTag,
  Rgba,
  SpriteDefinition,
  SwfDocument,
  TextDefinition,
  TextRecord,
  TwipsMatrix,
  TwipsRect,
} from './types.ts';

export class SwfXmlError extends Error {}

const FILTER_TYPES: Readonly<Record<string, string>> = {
  DROPSHADOWFILTER: 'dropShadow',
  BLURFILTER: 'blur',
  GLOWFILTER: 'glow',
  BEVELFILTER: 'bevel',
  GRADIENTGLOWFILTER: 'gradientGlow',
  GRADIENTBEVELFILTER: 'gradientBevel',
  CONVOLUTIONFILTER: 'convolution',
  COLORMATRIXFILTER: 'colorMatrix',
};
const FILTER_IGNORED_ATTRIBUTES = new Set(['type', 'id', 'reserved']);
const BUTTON_STATES: readonly (readonly [attribute: string, state: string])[] = [
  ['buttonStateUp', 'up'],
  ['buttonStateOver', 'over'],
  ['buttonStateDown', 'down'],
  ['buttonStateHitTest', 'hitTest'],
];
const EDIT_TEXT_FLAGS = [
  'wordWrap',
  'multiline',
  'password',
  'readOnly',
  'autoSize',
  'noSelect',
  'border',
  'wasStatic',
  'html',
  'useOutlines',
] as const;
const ESCAPED_NUL = '\\u0000';
const NUL = String.fromCharCode(0);
const SHAPE_TAGS = new Set(['DefineShapeTag', 'DefineShape2Tag', 'DefineShape3Tag', 'DefineShape4Tag']);
const MORPH_TAGS = new Set(['DefineMorphShapeTag', 'DefineMorphShape2Tag']);
const TEXT_TAGS = new Set(['DefineTextTag', 'DefineText2Tag']);
const FONT_TAGS = new Set(['DefineFontTag', 'DefineFont2Tag', 'DefineFont3Tag']);
const BITMAP_TAGS = new Set([
  'DefineBitsTag',
  'DefineBitsJPEG2Tag',
  'DefineBitsJPEG3Tag',
  'DefineBitsJPEG4Tag',
  'DefineBitsLosslessTag',
  'DefineBitsLossless2Tag',
]);

function attribute(element: XmlElement, name: string): string {
  const value = element.attributes[name];
  if (value === undefined) throw new SwfXmlError(`<${element.attributes['type'] ?? element.name}> lacks attribute ${name}`);
  return value;
}

function numberAttribute(element: XmlElement, name: string): number {
  const value = Number(attribute(element, name));
  if (!Number.isFinite(value)) throw new SwfXmlError(`Attribute ${name} is not a number`);
  return value;
}

function optionalNumber(element: XmlElement, name: string): number | undefined {
  const value = element.attributes[name];
  return value === undefined ? undefined : Number(value);
}

function flag(element: XmlElement, name: string): boolean {
  return element.attributes[name] === 'true';
}

function requiredChild(element: XmlElement, name: string): XmlElement {
  const found = child(element, name);
  if (found === undefined) throw new SwfXmlError(`<${element.attributes['type'] ?? element.name}> lacks <${name}>`);
  return found;
}

function firstNumberAttribute(element: XmlElement, names: readonly string[]): number {
  for (const name of names) {
    const value = optionalNumber(element, name);
    if (value !== undefined) return value;
  }
  throw new SwfXmlError(`<${element.attributes['type'] ?? element.name}> lacks any of ${names.join(', ')}`);
}

export function readRect(element: XmlElement): TwipsRect {
  return {
    xMin: numberAttribute(element, 'Xmin'),
    yMin: numberAttribute(element, 'Ymin'),
    xMax: numberAttribute(element, 'Xmax'),
    yMax: numberAttribute(element, 'Ymax'),
  };
}

export function readMatrix(element: XmlElement | undefined): TwipsMatrix {
  if (element === undefined) return IDENTITY_MATRIX;
  const hasScale = flag(element, 'hasScale');
  const hasRotate = flag(element, 'hasRotate');
  return {
    a: hasScale ? snapFixed16(numberAttribute(element, 'scaleX')) : 1,
    b: hasRotate ? snapFixed16(numberAttribute(element, 'rotateSkew0')) : 0,
    c: hasRotate ? snapFixed16(numberAttribute(element, 'rotateSkew1')) : 0,
    d: hasScale ? snapFixed16(numberAttribute(element, 'scaleY')) : 1,
    tx: optionalNumber(element, 'translateX') ?? 0,
    ty: optionalNumber(element, 'translateY') ?? 0,
  };
}

export function readColor(element: XmlElement): Rgba {
  return {
    r: numberAttribute(element, 'red'),
    g: numberAttribute(element, 'green'),
    b: numberAttribute(element, 'blue'),
    a: optionalNumber(element, 'alpha') ?? OPAQUE_ALPHA,
  };
}

export function readColorTransform(element: XmlElement): ColorTransform {
  const hasMult = flag(element, 'hasMultTerms');
  const hasAdd = flag(element, 'hasAddTerms');
  const mult = (name: string): number =>
    hasMult ? (optionalNumber(element, name) ?? COLOR_TRANSFORM_FIXED_ONE) / COLOR_TRANSFORM_FIXED_ONE : 1;
  const add = (name: string): number => (hasAdd ? (optionalNumber(element, name) ?? 0) : 0);
  return {
    rMult: mult('redMultTerm'),
    gMult: mult('greenMultTerm'),
    bMult: mult('blueMultTerm'),
    aMult: mult('alphaMultTerm'),
    rAdd: add('redAddTerm'),
    gAdd: add('greenAddTerm'),
    bAdd: add('blueAddTerm'),
    aAdd: add('alphaAddTerm'),
  };
}

function parseScalar(value: string): FilterValue {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numeric = Number(value);
  return value.trim() !== '' && Number.isFinite(numeric) ? numeric : value;
}

function readFilterChild(element: XmlElement): FilterValue {
  if (element.attributes['type'] === 'RGBA' || element.attributes['type'] === 'RGB') return readColor(element);
  if (element.children.length > 0) return items(element).map(readFilterChild);
  return parseScalar(element.text.trim());
}

export function readFilter(element: XmlElement): Filter {
  const sourceType = attribute(element, 'type');
  const type = FILTER_TYPES[sourceType];
  if (type === undefined) throw new SwfXmlError(`Unknown filter ${sourceType}`);
  const filter: Record<string, FilterValue> = { type };
  for (const [name, value] of Object.entries(element.attributes)) {
    if (!FILTER_IGNORED_ATTRIBUTES.has(name)) filter[name] = parseScalar(value);
  }
  for (const property of element.children) filter[property.name] = readFilterChild(property);
  return filter as Filter;
}

function readFilters(element: XmlElement | undefined): Filter[] | undefined {
  return element === undefined ? undefined : items(element).map(readFilter);
}

function readPlace(element: XmlElement, version: number): PlaceTag {
  const hasCharacter = version === 1 || flag(element, 'placeFlagHasCharacter');
  const colorElement = child(element, 'colorTransform');
  const filters = flag(element, 'placeFlagHasFilterList') ? readFilters(child(element, 'surfaceFilterList')) : undefined;
  return {
    kind: 'place',
    depth: numberAttribute(element, 'depth'),
    move: version !== 1 && flag(element, 'placeFlagMove'),
    hasClipActions: flag(element, 'placeFlagHasClipActions'),
    ...(hasCharacter ? { characterId: numberAttribute(element, 'characterId') } : {}),
    ...(version === 1 || flag(element, 'placeFlagHasMatrix') ? { matrix: readMatrix(child(element, 'matrix')) } : {}),
    ...((version === 1 ? colorElement !== undefined : flag(element, 'placeFlagHasColorTransform')) && colorElement
      ? { colorTransform: readColorTransform(colorElement) }
      : {}),
    ...(flag(element, 'placeFlagHasName') ? { name: attribute(element, 'name') } : {}),
    ...(flag(element, 'placeFlagHasRatio') ? { ratio: numberAttribute(element, 'ratio') } : {}),
    ...(flag(element, 'placeFlagHasClipDepth') ? { clipDepth: numberAttribute(element, 'clipDepth') } : {}),
    ...(filters === undefined ? {} : { filters }),
    ...(flag(element, 'placeFlagHasBlendMode') ? { blendMode: numberAttribute(element, 'blendMode') } : {}),
    ...(flag(element, 'placeFlagHasVisible') ? { visible: numberAttribute(element, 'visible') !== 0 } : {}),
  };
}

function readStartSound(element: XmlElement): ControlTag {
  const info = child(element, 'soundInfo');
  const loopCount = info !== undefined && flag(info, 'hasLoops') ? numberAttribute(info, 'loopCount') : undefined;
  return {
    kind: 'startSound',
    soundId: numberAttribute(element, 'soundId'),
    syncStop: info !== undefined && flag(info, 'syncStop'),
    syncNoMultiple: info !== undefined && flag(info, 'syncNoMultiple'),
    ...(loopCount === undefined ? {} : { loopCount }),
  };
}

export function readControlTag(element: XmlElement): ControlTag | undefined {
  switch (element.attributes['type']) {
    case 'PlaceObjectTag':
      return readPlace(element, 1);
    case 'PlaceObject2Tag':
      return readPlace(element, 2);
    case 'PlaceObject3Tag':
      return readPlace(element, 3);
    case 'RemoveObjectTag':
    case 'RemoveObject2Tag':
      return { kind: 'remove', depth: numberAttribute(element, 'depth') };
    case 'ShowFrameTag':
      return { kind: 'showFrame' };
    case 'FrameLabelTag':
      return { kind: 'label', name: attribute(element, 'name') };
    case 'StartSoundTag':
    case 'StartSound2Tag':
      return readStartSound(element);
    case 'DoActionTag':
      return { kind: 'action' };
    default:
      return undefined;
  }
}

function readControlTags(elements: readonly XmlElement[]): ControlTag[] {
  const tags: ControlTag[] = [];
  for (const element of elements) {
    const tag = readControlTag(element);
    if (tag !== undefined) tags.push(tag);
  }
  return tags;
}

function readSprite(element: XmlElement): SpriteDefinition {
  return {
    kind: 'sprite',
    id: numberAttribute(element, 'spriteId'),
    frameCount: numberAttribute(element, 'frameCount'),
    tags: readControlTags(items(child(element, 'subTags'))),
  };
}

function readMorph(element: XmlElement): MorphShapeDefinition {
  const fillStyles = items(child(requiredChild(element, 'morphFillStyles'), 'fillStyles'));
  const lineStyles = items(child(requiredChild(element, 'morphLineStyles'), 'lineStyles'));
  return {
    kind: 'morphShape',
    id: numberAttribute(element, 'characterId'),
    startBounds: readRect(requiredChild(element, 'startBounds')),
    endBounds: readRect(requiredChild(element, 'endBounds')),
    fills: fillStyles.map((style) => ({
      fillStyleType: numberAttribute(style, 'fillStyleType'),
      start: readColor(requiredChild(style, 'startColor')),
      end: readColor(requiredChild(style, 'endColor')),
    })),
    lines: lineStyles.map((style) => ({
      startWidth: numberAttribute(style, 'startWidth'),
      endWidth: numberAttribute(style, 'endWidth'),
      start: readColor(requiredChild(style, 'startColor')),
      end: readColor(requiredChild(style, 'endColor')),
    })),
  };
}

function readTextRecord(element: XmlElement): TextRecord {
  const color = child(element, 'textColor');
  const fontId = flag(element, 'styleFlagsHasFont') ? numberAttribute(element, 'fontId') : undefined;
  const height = flag(element, 'styleFlagsHasFont') ? numberAttribute(element, 'textHeight') : undefined;
  const xOffset = flag(element, 'styleFlagsHasXOffset') ? numberAttribute(element, 'xOffset') : undefined;
  const yOffset = flag(element, 'styleFlagsHasYOffset') ? numberAttribute(element, 'yOffset') : undefined;
  return {
    glyphIndices: items(child(element, 'glyphEntries')).map((glyph) => numberAttribute(glyph, 'glyphIndex')),
    ...(fontId === undefined ? {} : { fontId }),
    ...(height === undefined ? {} : { height }),
    ...(xOffset === undefined ? {} : { xOffset }),
    ...(yOffset === undefined ? {} : { yOffset }),
    ...(flag(element, 'styleFlagsHasColor') && color ? { color: readColor(color) } : {}),
  };
}

function readText(element: XmlElement): TextDefinition {
  return {
    kind: 'text',
    id: firstNumberAttribute(element, ['characterID', 'characterId']),
    bounds: readRect(requiredChild(element, 'textBounds')),
    matrix: readMatrix(child(element, 'textMatrix')),
    records: items(child(element, 'textRecords')).map(readTextRecord),
  };
}

function readEditText(element: XmlElement): EditTextDefinition {
  const color = child(element, 'textColor');
  const flags: Record<string, boolean> = {};
  for (const name of EDIT_TEXT_FLAGS) flags[name] = flag(element, name);
  const layout = flag(element, 'hasLayout');
  const optional = (enabled: boolean, name: string): number | undefined =>
    enabled ? optionalNumber(element, name) : undefined;
  const values = {
    fontId: optional(flag(element, 'hasFont'), 'fontId'),
    fontHeight: optional(flag(element, 'hasFont'), 'fontHeight'),
    align: optional(layout, 'align'),
    leftMargin: optional(layout, 'leftMargin'),
    rightMargin: optional(layout, 'rightMargin'),
    indent: optional(layout, 'indent'),
    leading: optional(layout, 'leading'),
    maxLength: optional(flag(element, 'hasMaxLength'), 'maxLength'),
  };
  const definedValues = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
  return {
    kind: 'editText',
    id: firstNumberAttribute(element, ['characterID', 'characterId']),
    bounds: readRect(requiredChild(element, 'bounds')),
    variableName: element.attributes['variableName'] ?? '',
    flags,
    ...definedValues,
    ...(flag(element, 'hasTextColor') && color ? { color: readColor(color) } : {}),
    ...(flag(element, 'hasText') ? { initialText: element.attributes['initialText'] ?? '' } : {}),
  };
}

function readButtonRecord(element: XmlElement): ButtonRecord {
  const colorElement = child(element, 'colorTransform');
  const filters = flag(element, 'buttonHasFilterList') ? readFilters(child(element, 'filterList')) : undefined;
  return {
    characterId: numberAttribute(element, 'characterId'),
    depth: numberAttribute(element, 'placeDepth'),
    matrix: readMatrix(child(element, 'placeMatrix')),
    states: BUTTON_STATES.filter(([name]) => flag(element, name)).map(([, state]) => state),
    ...(colorElement ? { colorTransform: readColorTransform(colorElement) } : {}),
    ...(filters === undefined ? {} : { filters }),
    ...(flag(element, 'buttonHasBlendMode') ? { blendMode: numberAttribute(element, 'blendMode') } : {}),
  };
}

function readButton(element: XmlElement): ButtonDefinition {
  return {
    kind: 'button',
    id: numberAttribute(element, 'buttonId'),
    trackAsMenu: flag(element, 'trackAsMenu'),
    records: items(child(element, 'characters')).map(readButtonRecord),
    conditions: items(child(element, 'actions')).map((action) =>
      Object.entries(action.attributes)
        .filter(([name, value]) => name.startsWith('cond') && value === 'true')
        .map(([name]) => name),
    ),
  };
}

export function stripNulTerminator(name: string): string {
  let result = name;
  for (;;) {
    if (result.endsWith(ESCAPED_NUL)) result = result.slice(0, -ESCAPED_NUL.length);
    else if (result.endsWith(NUL)) result = result.slice(0, -NUL.length);
    else return result;
  }
}

function readFont(element: XmlElement): FontDefinition {
  return {
    kind: 'font',
    id: firstNumberAttribute(element, ['fontID', 'fontId']),
    name: stripNulTerminator(attribute(element, 'fontName')),
    bold: flag(element, 'fontFlagsBold'),
    italic: flag(element, 'fontFlagsItalic'),
    codeTable: items(child(element, 'codeTable')).map((code) => Number(code.text.trim())),
  };
}

export function readCharacter(element: XmlElement): CharacterDefinition | undefined {
  const type = element.attributes['type'] ?? '';
  if (SHAPE_TAGS.has(type)) {
    return {
      kind: 'shape',
      id: numberAttribute(element, 'shapeId'),
      bounds: readRect(requiredChild(element, 'shapeBounds')),
      tagType: type,
    };
  }
  if (MORPH_TAGS.has(type)) return readMorph(element);
  if (TEXT_TAGS.has(type)) return readText(element);
  if (FONT_TAGS.has(type)) return readFont(element);
  if (BITMAP_TAGS.has(type)) {
    return { kind: 'bitmap', id: firstNumberAttribute(element, ['characterID', 'characterId']), tagType: type };
  }
  switch (type) {
    case 'DefineSpriteTag':
      return readSprite(element);
    case 'DefineEditTextTag':
      return readEditText(element);
    case 'DefineButton2Tag':
      return readButton(element);
    case 'DefineSoundTag':
      return {
        kind: 'sound',
        id: numberAttribute(element, 'soundId'),
        format: numberAttribute(element, 'soundFormat'),
        rate: numberAttribute(element, 'soundRate'),
        is16Bit: flag(element, 'soundSize'),
        stereo: flag(element, 'soundType'),
        sampleCount: numberAttribute(element, 'soundSampleCount'),
      };
    default:
      return undefined;
  }
}

function readExports(element: XmlElement): [string, number][] {
  const ids = items(child(element, 'tags')).map((entry) => Number(entry.text.trim()));
  const names = items(child(element, 'names')).map((entry) => entry.text);
  if (ids.length !== names.length) throw new SwfXmlError('ExportAssets tag ids and names differ in length');
  return names.map((name, index) => [name, ids[index] ?? 0]);
}

export function readSwfXml(root: XmlElement): SwfDocument {
  if (root.name !== 'swf') throw new SwfXmlError(`Expected <swf> root, found <${root.name}>`);
  const major = root.attributes['_xmlExportMajor'];
  if (major !== FFDEC_XML_MAJOR_VERSION) {
    throw new SwfXmlError(`Unsupported FFDec XML major version ${major ?? 'none'}, expected ${FFDEC_XML_MAJOR_VERSION}`);
  }
  const characters = new Map<number, CharacterDefinition>();
  const exports = new Map<string, number>();
  const tagElements = items(requiredChild(root, 'tags'));
  for (const element of tagElements) {
    const definition = readCharacter(element);
    if (definition !== undefined) {
      if (characters.has(definition.id)) throw new SwfXmlError(`Duplicate character id ${definition.id}`);
      characters.set(definition.id, definition);
    }
    if (element.attributes['type'] === 'ExportAssetsTag') {
      for (const [name, id] of readExports(element)) exports.set(name, id);
    }
  }
  return {
    generator: root.attributes['_generator'] ?? '',
    version: numberAttribute(root, 'version'),
    frameRate: numberAttribute(root, 'frameRate'),
    stageBounds: readRect(requiredChild(root, 'displayRect')),
    characters,
    exports,
    root: { kind: 'sprite', id: 0, frameCount: numberAttribute(root, 'frameCount'), tags: readControlTags(tagElements) },
  };
}
