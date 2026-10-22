import { describe, expect, it } from 'vitest';
import { externalReferences, normalizeLibrarySvg, readSvgFrame, SvgError } from './svg.ts';

const FFDEC_SVG =
  '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" height="20.5px" width="40.0px">\n  <g transform="matrix(1.0, 0.0, 0.0, 1.0, 10.0, -5.0)">\n    <path d="M0 0"/>\n  </g>\n</svg>';

describe('library SVG', () => {
  it('reads the FFDec size and origin offset', () => {
    expect(readSvgFrame(FFDEC_SVG)).toEqual({ width: 40, height: 20.5, offsetX: 10, offsetY: -5 });
  });

  it('adds a viewBox so the SVG scales when drawn into a canvas', () => {
    const svg = normalizeLibrarySvg(FFDEC_SVG, { xMin: -10, yMin: 5, xMax: 30, yMax: 25.5 }, 'shape 1');
    expect(svg).toContain('height="20.5" width="40" viewBox="0 0 40 20.5"');
  });

  it('rejects SVGs whose origin disagrees with the bounds', () => {
    expect(() => normalizeLibrarySvg(FFDEC_SVG, { xMin: 0, yMin: 0, xMax: 40, yMax: 20.5 }, 'shape 1')).toThrow(SvgError);
  });

  it('finds references that an image-loaded SVG could not resolve', () => {
    expect(externalReferences('<image xlink:href="data:image/png;base64,AA"/><use xlink:href="#a"/><image href="x.png"/>')).toEqual([
      'x.png',
    ]);
  });
});
