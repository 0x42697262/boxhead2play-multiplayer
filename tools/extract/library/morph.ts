import { MORPH_RATIO_MAX, OPAQUE_ALPHA } from '../tuning.ts';
import type { PixelRect } from '../swf/geometry.ts';
import type { MorphShapeDefinition, Rgba } from '../swf/types.ts';
import { formatSvgNumber, SvgError } from './svg.ts';

const PATH_ELEMENT = /<path\b([^>]*?)(\/>|>([\s\S]*?)<\/path>)/g;
const FILL_ATTRIBUTE = /\sfill="([^"]*)"/;
const PATH_ANIMATION = /<animate attributeName="d"[^>]*values="([^"]*)"/;
const PATH_TOKEN = /[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
const COMMAND_LETTER = /^[A-Za-z]$/;
const NO_FILL = 'none';
const HEX_RADIX = 16;
const HEX_CHANNEL_DIGITS = 2;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export interface MorphPath {
  readonly start: string;
  readonly end: string;
}

export function readMorphFillPaths(svg: string): MorphPath[] {
  const paths: MorphPath[] = [];
  for (const match of svg.matchAll(PATH_ELEMENT)) {
    const attributes = match[1] ?? '';
    if (FILL_ATTRIBUTE.exec(attributes)?.[1] === NO_FILL) continue;
    const values = PATH_ANIMATION.exec(match[3] ?? '')?.[1];
    if (values === undefined) throw new SvgError('Morph fill path has no path animation');
    const [start, end, ...rest] = values.split(';');
    if (start === undefined || end === undefined || rest.length > 0) throw new SvgError('Morph path animation is not start;end');
    paths.push({ start, end });
  }
  return paths;
}

export function interpolatePath(start: string, end: string, t: number): string {
  const from = start.match(PATH_TOKEN) ?? [];
  const to = end.match(PATH_TOKEN) ?? [];
  if (from.length !== to.length) throw new SvgError('Morph start and end paths differ in structure');
  return from
    .map((token, index) => {
      const target = to[index] ?? '';
      if (COMMAND_LETTER.test(token) || COMMAND_LETTER.test(target)) {
        if (token !== target) throw new SvgError(`Morph path commands differ: ${token} vs ${target}`);
        return token;
      }
      return formatSvgNumber(Number(token) + (Number(target) - Number(token)) * t);
    })
    .join(' ');
}

export function interpolateColor(start: Rgba, end: Rgba, t: number): Rgba {
  const lerp = (from: number, to: number): number => Math.round(from + (to - from) * t);
  return { r: lerp(start.r, end.r), g: lerp(start.g, end.g), b: lerp(start.b, end.b), a: lerp(start.a, end.a) };
}

function hexChannel(value: number): string {
  return value.toString(HEX_RADIX).padStart(HEX_CHANNEL_DIGITS, '0');
}

export function assertSupportedMorph(definition: MorphShapeDefinition): void {
  if (definition.fills.length !== 1 || definition.fills[0]?.fillStyleType !== 0) {
    throw new SvgError(`Morph ${definition.id} must have exactly one solid fill`);
  }
  const visibleLine = definition.lines.find(
    (line) => (line.startWidth > 0 && line.start.a > 0) || (line.endWidth > 0 && line.end.a > 0),
  );
  if (visibleLine !== undefined) throw new SvgError(`Morph ${definition.id} has visible strokes`);
}

export function renderMorphSvg(definition: MorphShapeDefinition, paths: readonly MorphPath[], ratio: number, bounds: PixelRect): string {
  assertSupportedMorph(definition);
  const fill = definition.fills[0];
  if (fill === undefined) throw new SvgError(`Morph ${definition.id} has no fill`);
  const t = ratio / MORPH_RATIO_MAX;
  const color = interpolateColor(fill.start, fill.end, t);
  const width = formatSvgNumber(bounds.xMax - bounds.xMin);
  const height = formatSvgNumber(bounds.yMax - bounds.yMin);
  const viewBox = [formatSvgNumber(bounds.xMin), formatSvgNumber(bounds.yMin), width, height].join(' ');
  const fillColor = `#${hexChannel(color.r)}${hexChannel(color.g)}${hexChannel(color.b)}`;
  const opacity = formatSvgNumber(color.a / OPAQUE_ALPHA);
  const body = paths
    .map(
      (path) =>
        `<path d="${interpolatePath(path.start, path.end, t)}" fill="${fillColor}" fill-opacity="${opacity}" fill-rule="evenodd"/>`,
    )
    .join('');
  return `<svg xmlns="${SVG_NAMESPACE}" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`;
}
