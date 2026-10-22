import { describe, expect, it } from 'vitest';
import { rect } from '../testing/fixtures.ts';
import type { MorphShapeDefinition } from '../swf/types.ts';
import { interpolateColor, interpolatePath, readMorphFillPaths, renderMorphSvg } from './morph.ts';
import { SvgError } from './svg.ts';

const MORPH_SVG =
  '<svg><g transform="matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)">' +
  '<path d="M0 0 L10 0" fill="#ff0000"><animate attributeName="fill" values="#ff0000;#ff0001"/><animate attributeName="d" values="M0 0 L10 0;M0 10 L30 0"/></path>' +
  '<path d="M0 0" fill="none" stroke="#000000"><animate attributeName="d" values="M0 0;M1 1"/></path>' +
  '</g></svg>';

const DEFINITION: MorphShapeDefinition = {
  kind: 'morphShape',
  id: 15,
  startBounds: rect(0, 0, 10, 0),
  endBounds: rect(0, 0, 30, 10),
  fills: [{ fillStyleType: 0, start: { r: 255, g: 0, b: 0, a: 255 }, end: { r: 255, g: 0, b: 0, a: 127 } }],
  lines: [{ startWidth: 0, endWidth: 0, start: { r: 0, g: 0, b: 0, a: 0 }, end: { r: 0, g: 0, b: 0, a: 0 } }],
};

describe('morph shapes', () => {
  it('reads start and end paths of filled paths only', () => {
    expect(readMorphFillPaths(MORPH_SVG)).toEqual([{ start: 'M0 0 L10 0', end: 'M0 10 L30 0' }]);
  });

  it('interpolates path numbers and keeps commands', () => {
    expect(interpolatePath('M0 0 L10 0', 'M0 10 L30 0', 0.5)).toBe('M 0 5 L 20 0');
    expect(() => interpolatePath('M0 0', 'L0 0', 0.5)).toThrow(SvgError);
  });

  it('interpolates colors with rounding', () => {
    expect(interpolateColor({ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 0, b: 0, a: 127 }, 0.5)).toEqual({ r: 128, g: 0, b: 0, a: 191 });
  });

  it('renders a standalone SVG in character space', () => {
    const svg = renderMorphSvg(DEFINITION, readMorphFillPaths(MORPH_SVG), 65535, { xMin: 0, yMin: 0, xMax: 30, yMax: 10 });
    expect(svg).toContain('viewBox="0 0 30 10"');
    expect(svg).toContain('d="M 0 10 L 30 0" fill="#ff0000" fill-opacity="0.498"');
  });
});
