import type { ColorTransform as OutputColorTransform, DisplayItem, Filter as OutputFilter } from '../../../src/adapters/assets/schemas.ts';
import { toPixelMatrix } from '../swf/geometry.ts';
import type { DisplayObjectState } from '../swf/timeline.ts';
import type { ColorTransform, Filter } from '../swf/types.ts';

const IDENTITY_TRANSFORM: ColorTransform = {
  rMult: 1,
  gMult: 1,
  bMult: 1,
  aMult: 1,
  rAdd: 0,
  gAdd: 0,
  bAdd: 0,
  aAdd: 0,
};

export function isIdentityColorTransform(transform: ColorTransform): boolean {
  return (Object.keys(IDENTITY_TRANSFORM) as (keyof ColorTransform)[]).every(
    (key) => transform[key] === IDENTITY_TRANSFORM[key],
  );
}

export function outputColorTransform(transform: ColorTransform | undefined): { colorTransform?: OutputColorTransform } {
  return transform === undefined || isIdentityColorTransform(transform) ? {} : { colorTransform: { ...transform } };
}

export function outputFilters(filters: readonly Filter[] | undefined): { filters?: OutputFilter[] } {
  return filters === undefined || filters.length === 0 ? {} : { filters: filters.map((filter) => ({ ...filter }) as OutputFilter) };
}

export function toDisplayItem(state: DisplayObjectState): DisplayItem {
  return {
    depth: state.depth,
    characterId: state.characterId,
    instance: state.instance,
    matrix: [...toPixelMatrix(state.matrix)],
    ...(state.name === undefined ? {} : { name: state.name }),
    ...outputColorTransform(state.colorTransform),
    ...outputFilters(state.filters),
    ...(state.clipDepth === undefined ? {} : { clipDepth: state.clipDepth }),
    ...(state.blendMode === undefined ? {} : { blendMode: state.blendMode }),
    ...(state.ratio === undefined ? {} : { ratio: state.ratio }),
    ...(state.visible === undefined ? {} : { visible: state.visible }),
    ...(state.hasClipActions ? { hasClipActions: true } : {}),
  };
}
