import type { XsiCatalog, XsiFrame, XsiMaterial, XsiModel, XsiSet } from '../../assets/schemas.ts';
import type { Matrix } from '../geometry/Matrix.ts';
import { pointsBounds, union, type Rect } from '../geometry/Rect.ts';
import {
  ALPHA_PERCENT,
  XSI_PROFILE_EDGE_MATERIAL,
  XSI_SHADE_DARK,
  XSI_SHADE_LIGHT,
  XSI_SHADER_CONTRAST,
  XSI_SHADOW_MATERIAL,
} from '../tuning.ts';
import { textureLinkage, type StyleSheet } from './styleSheets.ts';

export interface ColorFill {
  readonly kind: 'color';
  readonly color: number;
  readonly alpha: number;
}

export interface TextureFill {
  readonly kind: 'texture';
  readonly linkage: string;
  readonly size: { readonly x: number; readonly y: number };
  readonly matrix: Matrix;
}

export type XsiFill = ColorFill | TextureFill;

export interface XsiPolygon {
  readonly points: readonly number[];
  readonly fill: XsiFill;
  readonly shade?: ColorFill;
}

export interface XsiPlane {
  readonly model: string;
  readonly edges: readonly (readonly number[])[];
  readonly polygons: readonly XsiPolygon[];
}

export interface StrokeStyle {
  readonly thickness: number;
  readonly color: number;
  readonly alpha: number;
}

export interface XsiDrawing {
  readonly planes: readonly XsiPlane[];
  readonly shadows: readonly (readonly number[])[];
  readonly shadowFill: ColorFill;
  readonly edgeStyle: StrokeStyle;
  readonly scale: number;
}

export type SetIndex = ReadonlyMap<string, ReadonlyMap<string, XsiSet>>;

const NO_COLOR = 0;
const DEFAULT_TEXTURE_SIZE = { x: 64, y: 64 } as const;

export function indexSets(xsi: XsiCatalog): SetIndex {
  const groups = new Map<string, Map<string, XsiSet>>();
  for (const set of Object.values(xsi.sets)) {
    const group = groups.get(set.groupId) ?? new Map<string, XsiSet>();
    group.set(set.animId, set);
    groups.set(set.groupId, group);
  }
  return groups;
}

function framesOf(index: SetIndex, groupId: string | undefined, animId: string, direction: number, frame: number): XsiFrame['Models'] | undefined {
  if (groupId === undefined) return undefined;
  return index.get(groupId)?.get(animId)?.directions[direction]?.[frame]?.Models;
}

export function newestFirst<T>(items: readonly T[] | undefined): T[] {
  return items ? items.slice().reverse() : [];
}

export function literalKeysBottomToTop<T>(literal: Readonly<Record<string, T>>): [string, T][] {
  return Object.entries(literal).reverse();
}

function colorFill(material: XsiMaterial | undefined): ColorFill {
  return { kind: 'color', color: material?.mColor ?? NO_COLOR, alpha: (material?.mAlpha ?? ALPHA_PERCENT) / ALPHA_PERCENT };
}

export function shadeFill(brightness: number | undefined): ColorFill | undefined {
  if (!brightness) return undefined;
  return {
    kind: 'color',
    color: brightness >= 0 ? XSI_SHADE_LIGHT : XSI_SHADE_DARK,
    alpha: (ALPHA_PERCENT * Math.abs(brightness) * XSI_SHADER_CONTRAST) / ALPHA_PERCENT,
  };
}

function polygonFill(xsi: XsiCatalog, sheet: StyleSheet, model: XsiModel, index: number): XsiFill {
  const materialName = model.Shape_Material?.[index] ?? '';
  const material = sheet.materials[materialName];
  const matrix = model.Shape_Matrix?.[index];
  const linkage = material ? textureLinkage(xsi, materialName, material) : undefined;
  if (matrix && linkage !== undefined) {
    return { kind: 'texture', linkage, size: material?.mSize ?? DEFAULT_TEXTURE_SIZE, matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty] };
  }
  return colorFill(material);
}

export function resolveModel(
  index: SetIndex,
  sheet: StyleSheet,
  set: XsiSet,
  name: string,
  model: XsiModel,
  direction: number,
  frame: number,
): XsiModel | undefined {
  let resolved = model;
  if (resolved.Empty) resolved = framesOf(index, set.renderPartner, set.animId, direction, frame)?.[name] ?? resolved;
  const styleModel = sheet.models[name];
  if (styleModel) {
    if (!styleModel.visible) return undefined;
    if (styleModel.groupRemap) resolved = framesOf(index, sheet.groupRemap, set.animId, direction, frame)?.[name] ?? resolved;
  }
  return resolved;
}

export function buildXsiDrawing(xsi: XsiCatalog, index: SetIndex, sheet: StyleSheet, setId: string, direction: number, frame: number): XsiDrawing | undefined {
  const set = xsi.sets[setId];
  const models = set?.directions[direction]?.[frame]?.Models;
  if (!set || !models) return undefined;
  const planes: XsiPlane[] = [];
  const shadows: (readonly number[])[] = [];
  for (const [name, source] of literalKeysBottomToTop(models)) {
    const model = resolveModel(index, sheet, set, name, source, direction, frame);
    if (!model) continue;
    const polygons = newestFirst(model.Shape_vList?.map((points, polygon) => ({ points, polygon }))).map(({ points, polygon }) => {
      const shade = shadeFill(model.Shape_Brightness?.[polygon]);
      const fill = polygonFill(xsi, sheet, model, polygon);
      return shade ? { points, fill, shade } : { points, fill };
    });
    planes.push({ model: name, edges: newestFirst(model.PEdge), polygons });
    shadows.unshift(...newestFirst(model.Shadow));
  }
  const edge = sheet.materials[XSI_PROFILE_EDGE_MATERIAL];
  return {
    planes,
    shadows,
    shadowFill: colorFill(sheet.materials[XSI_SHADOW_MATERIAL]),
    edgeStyle: { thickness: edge?.mThickness ?? 0, color: edge?.mColor ?? NO_COLOR, alpha: (edge?.mAlpha ?? ALPHA_PERCENT) / ALPHA_PERCENT },
    scale: sheet.scale,
  };
}

export function drawingBounds(drawing: XsiDrawing): Rect | null {
  let bounds: Rect | null = null;
  const halfStroke = drawing.edgeStyle.thickness / 2;
  for (const plane of drawing.planes) {
    for (const polygon of plane.polygons) bounds = union(bounds, pointsBounds(polygon.points));
    for (const edge of plane.edges) bounds = union(bounds, pointsBounds(edge, halfStroke));
  }
  for (const shadow of drawing.shadows) bounds = union(bounds, pointsBounds(shadow));
  return bounds;
}
