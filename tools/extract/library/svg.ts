import type { PixelRect } from '../swf/geometry.ts';

export class SvgError extends Error {}

export interface SvgFrame {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const ROOT_TAG = /<svg\b[^>]*>/;
const WIDTH_ATTRIBUTE = /\swidth="([-\d.]+)(?:px)?"/;
const HEIGHT_ATTRIBUTE = /\sheight="([-\d.]+)(?:px)?"/;
const FIRST_GROUP_TRANSFORM = /<g transform="matrix\(([^)]*)\)">/;
const HREF_ATTRIBUTE = /(?:xlink:)?href="([^"]*)"/g;
const MATRIX_TRANSLATE_X = 4;
const MATRIX_TRANSLATE_Y = 5;
const MATRIX_COMPONENTS = 6;
export const SVG_TOLERANCE_PX = 0.051;
const EMBEDDED_PREFIXES = ['data:', '#'] as const;
const DECIMALS = 3;

function readNumber(source: string, pattern: RegExp, what: string): number {
  const match = pattern.exec(source);
  if (match?.[1] === undefined) throw new SvgError(`SVG lacks ${what}`);
  return Number(match[1]);
}

export function readSvgFrame(svg: string): SvgFrame {
  const root = ROOT_TAG.exec(svg)?.[0];
  if (root === undefined) throw new SvgError('Document has no <svg> element');
  const transform = FIRST_GROUP_TRANSFORM.exec(svg)?.[1]?.split(',').map((part) => Number(part.trim()));
  if (transform?.length !== MATRIX_COMPONENTS) throw new SvgError('SVG lacks the FFDec offset group');
  return {
    width: readNumber(root, WIDTH_ATTRIBUTE, 'width'),
    height: readNumber(root, HEIGHT_ATTRIBUTE, 'height'),
    offsetX: transform[MATRIX_TRANSLATE_X] ?? 0,
    offsetY: transform[MATRIX_TRANSLATE_Y] ?? 0,
  };
}

export function externalReferences(svg: string): string[] {
  return [...svg.matchAll(HREF_ATTRIBUTE)]
    .map((match) => match[1] ?? '')
    .filter((href) => !EMBEDDED_PREFIXES.some((prefix) => href.startsWith(prefix)));
}

function near(first: number, second: number): boolean {
  return Math.abs(first - second) <= SVG_TOLERANCE_PX;
}

export function normalizeLibrarySvg(svg: string, bounds: PixelRect, label: string): string {
  const frame = readSvgFrame(svg);
  const width = bounds.xMax - bounds.xMin;
  const height = bounds.yMax - bounds.yMin;
  if (!near(frame.offsetX, -bounds.xMin) || !near(frame.offsetY, -bounds.yMin)) {
    throw new SvgError(`${label}: SVG origin (${frame.offsetX}, ${frame.offsetY}) does not match bounds (${bounds.xMin}, ${bounds.yMin})`);
  }
  if (!near(frame.width, width) || !near(frame.height, height)) {
    throw new SvgError(`${label}: SVG size ${frame.width}x${frame.height} does not match bounds ${width}x${height}`);
  }
  const external = externalReferences(svg);
  if (external.length > 0) throw new SvgError(`${label}: SVG references external resources ${external.join(', ')}`);
  return svg.replace(ROOT_TAG, (root) =>
    root
      .replace(WIDTH_ATTRIBUTE, ` width="${frame.width}"`)
      .replace(HEIGHT_ATTRIBUTE, ` height="${frame.height}"`)
      .replace(/>$/, ` viewBox="0 0 ${frame.width} ${frame.height}">`),
  );
}

export function formatSvgNumber(value: number): string {
  return String(Number(value.toFixed(DECIMALS)));
}
