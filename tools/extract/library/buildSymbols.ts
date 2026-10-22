import {
  ASSET_FORMAT_VERSION,
  type Button,
  type ButtonState,
  type EditText,
  type Graphic,
  type MorphShape,
  type Sprite,
  type StaticText,
  type SymbolsCatalog,
  type TextAlign,
  type TimelineSound,
} from '../../../src/adapters/assets/schemas.ts';
import { MORPH_RATIO_MAX, OutputPath, SVG_FILE_EXTENSION } from '../tuning.ts';
import { lerpRect, toPixelMatrix, toPixelRect, twipsToPixels } from '../swf/geometry.ts';
import type { SwfIndex } from '../swf/swfIndex.ts';
import type { ResolvedFrame } from '../swf/timeline.ts';
import type {
  ButtonDefinition,
  EditTextDefinition,
  FontDefinition,
  MorphShapeDefinition,
  StartSoundTag,
} from '../swf/types.ts';
import { outputColorTransform, outputFilters, toDisplayItem } from './displayItems.ts';
import { readMorphFillPaths, renderMorphSvg } from './morph.ts';
import { decodeStaticText } from './staticText.ts';
import { normalizeLibrarySvg, SvgError } from './svg.ts';

export interface OutputFile {
  readonly path: string;
  readonly content: string;
}

export interface LibraryInputs {
  readonly index: SwfIndex;
  readonly classes: ReadonlyMap<string, string>;
  readonly frameScripts: ReadonlyMap<number, ReadonlyMap<number, string>>;
  readonly selfHiddenSpriteIds: ReadonlySet<number>;
  readonly shapeSvgs: ReadonlyMap<number, string>;
  readonly textSvgs: ReadonlyMap<number, string>;
  readonly morphSvgs: ReadonlyMap<number, string>;
}

export interface LibraryOutput {
  readonly catalog: SymbolsCatalog;
  readonly files: OutputFile[];
}

const TEXT_ALIGNMENTS: readonly TextAlign[] = ['left', 'right', 'center', 'justify'];
const BUTTON_STATES = new Set<string>(['up', 'over', 'down', 'hitTest']);

function libraryFile(directory: string, name: string): string {
  return `${directory}/${name}${SVG_FILE_EXTENSION}`;
}

function toTimelineSound(tag: StartSoundTag): TimelineSound {
  return {
    characterId: tag.soundId,
    syncStop: tag.syncStop,
    syncNoMultiple: tag.syncNoMultiple,
    ...(tag.loopCount === undefined ? {} : { loopCount: tag.loopCount }),
  };
}

export function buildSprite(
  index: SwfIndex,
  spriteId: number,
  frames: readonly ResolvedFrame[],
  scripts: ReadonlyMap<number, string> | undefined,
  selfHidden: boolean,
): Sprite {
  const labels: Record<string, number> = {};
  const frameSounds: Record<string, TimelineSound[]> = {};
  frames.forEach((frame, frameIndex) => {
    for (const label of frame.labels) labels[label] = frameIndex;
    if (frame.sounds.length > 0) frameSounds[String(frameIndex)] = frame.sounds.map(toTimelineSound);
  });
  const scriptEntries = scripts === undefined ? [] : [...scripts.entries()].sort(([first], [second]) => first - second);
  return {
    frameCount: frames.length,
    ...(Object.keys(labels).length > 0 ? { labels } : {}),
    frames: frames.map((frame) => frame.displayList.map(toDisplayItem)),
    frameBounds: frames.map((_, frameIndex) => {
      const bounds = index.spriteFrameBounds(spriteId, frameIndex);
      return bounds === null ? null : toPixelRect(bounds);
    }),
    ...(Object.keys(frameSounds).length > 0 ? { frameSounds } : {}),
    ...(scriptEntries.length > 0
      ? { scripts: Object.fromEntries(scriptEntries.map(([frame, source]) => [String(frame), source])) }
      : {}),
    ...(selfHidden ? { selfHidden: true } : {}),
  };
}

function buildEditText(definition: EditTextDefinition): EditText {
  const px = (value: number | undefined): number | undefined => (value === undefined ? undefined : twipsToPixels(value));
  const optional = {
    fontId: definition.fontId,
    fontSize: px(definition.fontHeight),
    color: definition.color,
    align: definition.align === undefined ? undefined : TEXT_ALIGNMENTS[definition.align],
    leftMargin: px(definition.leftMargin),
    rightMargin: px(definition.rightMargin),
    indent: px(definition.indent),
    leading: px(definition.leading),
    maxLength: definition.maxLength,
    initialText: definition.initialText,
  };
  const flag = (name: string): boolean => definition.flags[name] === true;
  return {
    bounds: toPixelRect(definition.bounds),
    variableName: definition.variableName,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
    wordWrap: flag('wordWrap'),
    multiline: flag('multiline'),
    password: flag('password'),
    readOnly: flag('readOnly'),
    autoSize: flag('autoSize'),
    noSelect: flag('noSelect'),
    border: flag('border'),
    wasStatic: flag('wasStatic'),
    html: flag('html'),
    useOutlines: flag('useOutlines'),
  };
}

function buildButton(index: SwfIndex, definition: ButtonDefinition): Button {
  const bounds = index.characterBounds(definition.id);
  return {
    trackAsMenu: definition.trackAsMenu,
    bounds: bounds === null ? null : toPixelRect(bounds),
    records: definition.records.map((record) => ({
      states: record.states.filter((state): state is ButtonState => BUTTON_STATES.has(state)),
      characterId: record.characterId,
      depth: record.depth,
      matrix: [...toPixelMatrix(record.matrix)],
      ...outputColorTransform(record.colorTransform),
      ...outputFilters(record.filters),
      ...(record.blendMode === undefined ? {} : { blendMode: record.blendMode }),
    })),
    conditions: definition.conditions.map((condition) => [...condition]),
  };
}

function usedMorphRatios(timelines: readonly (readonly ResolvedFrame[])[], morphIds: ReadonlySet<number>): Map<number, Set<number>> {
  const ratios = new Map<number, Set<number>>();
  for (const frames of timelines) {
    for (const frame of frames) {
      for (const item of frame.displayList) {
        if (!morphIds.has(item.characterId)) continue;
        const set = ratios.get(item.characterId) ?? new Set<number>();
        set.add(item.ratio ?? 0);
        ratios.set(item.characterId, set);
      }
    }
  }
  return ratios;
}

function buildMorph(
  definition: MorphShapeDefinition,
  svg: string,
  ratios: ReadonlySet<number>,
  files: OutputFile[],
): MorphShape {
  const paths = readMorphFillPaths(svg);
  const entries: Record<string, Graphic> = {};
  for (const ratio of [...ratios].sort((first, second) => first - second)) {
    const bounds = toPixelRect(lerpRect(definition.startBounds, definition.endBounds, ratio / MORPH_RATIO_MAX));
    const path = libraryFile(OutputPath.MorphsDir, `${definition.id}_${ratio}`);
    files.push({ path, content: renderMorphSvg(definition, paths, ratio, bounds) });
    entries[String(ratio)] = { bounds, svg: path };
  }
  return {
    startBounds: toPixelRect(definition.startBounds),
    endBounds: toPixelRect(definition.endBounds),
    ratios: entries,
  };
}

function requireSvg(svgs: ReadonlyMap<number, string>, id: number, kind: string): string {
  const svg = svgs.get(id);
  if (svg === undefined) throw new SvgError(`FFDec produced no SVG for ${kind} ${id}`);
  return svg;
}

export function buildSymbols(inputs: LibraryInputs): LibraryOutput {
  const { index } = inputs;
  const document = index.document;
  const files: OutputFile[] = [];
  const catalog: SymbolsCatalog = {
    formatVersion: ASSET_FORMAT_VERSION,
    stage: {
      width: twipsToPixels(document.stageBounds.xMax - document.stageBounds.xMin),
      height: twipsToPixels(document.stageBounds.yMax - document.stageBounds.yMin),
      frameRate: document.frameRate,
    },
    exports: Object.fromEntries([...document.exports.entries()].sort(([first], [second]) => first.localeCompare(second))),
    classes: Object.fromEntries([...inputs.classes.entries()].sort(([first], [second]) => first.localeCompare(second))),
    shapes: {},
    morphShapes: {},
    texts: {},
    editTexts: {},
    buttons: {},
    sprites: {},
    root: buildSprite(index, document.root.id, index.timeline(document.root.id), inputs.frameScripts.get(document.root.id), false),
  };
  const fontById = (id: number): FontDefinition | undefined => {
    const definition = index.character(id);
    return definition?.kind === 'font' ? definition : undefined;
  };
  const definitions = [...document.characters.values()].sort((first, second) => first.id - second.id);
  const spriteIds = definitions.filter((definition) => definition.kind === 'sprite').map((definition) => definition.id);
  const morphIds = new Set(definitions.filter((definition) => definition.kind === 'morphShape').map((definition) => definition.id));
  const ratios = usedMorphRatios([document.root.id, ...spriteIds].map((id) => index.timeline(id)), morphIds);

  for (const definition of definitions) {
    const key = String(definition.id);
    switch (definition.kind) {
      case 'shape': {
        const bounds = toPixelRect(definition.bounds);
        const path = libraryFile(OutputPath.ShapesDir, key);
        const svg = requireSvg(inputs.shapeSvgs, definition.id, 'shape');
        files.push({ path, content: normalizeLibrarySvg(svg, bounds, `shape ${key}`) });
        catalog.shapes[key] = { bounds, svg: path };
        break;
      }
      case 'text': {
        const bounds = toPixelRect(definition.bounds);
        const path = libraryFile(OutputPath.TextsDir, key);
        const svg = requireSvg(inputs.textSvgs, definition.id, 'text');
        files.push({ path, content: normalizeLibrarySvg(svg, bounds, `text ${key}`) });
        const decoded = decodeStaticText(definition, fontById);
        const entry: StaticText = { bounds, svg: path, text: decoded.text, fontIds: decoded.fontIds };
        catalog.texts[key] = entry;
        break;
      }
      case 'morphShape':
        catalog.morphShapes[key] = buildMorph(
          definition,
          requireSvg(inputs.morphSvgs, definition.id, 'morph shape'),
          ratios.get(definition.id) ?? new Set([0]),
          files,
        );
        break;
      case 'editText':
        catalog.editTexts[key] = buildEditText(definition);
        break;
      case 'button':
        catalog.buttons[key] = buildButton(index, definition);
        break;
      case 'sprite':
        catalog.sprites[key] = buildSprite(
          index,
          definition.id,
          index.timeline(definition.id),
          inputs.frameScripts.get(definition.id),
          inputs.selfHiddenSpriteIds.has(definition.id),
        );
        break;
      default:
        break;
    }
  }
  return { catalog, files };
}
