import { describe, expect, it } from 'vitest';
import { inlineSvgBody } from './floorComposite.ts';
import { PngError, readPngSize } from './png.ts';

describe('debug helpers', () => {
  it('reads PNG dimensions from the IHDR chunk', () => {
    const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 0xd7, 0, 0, 3, 0x27]);
    expect(readPngSize(header)).toEqual({ width: 727, height: 807 });
    expect(() => readPngSize(new Uint8Array(4))).toThrow(PngError);
  });

  it('inlines SVG bodies with prefixed ids', () => {
    expect(inlineSvgBody('<svg width="1"><pattern id="p"/><path fill="url(#p)"/><use xlink:href="#p"/></svg>', 's1_')).toBe(
      '<pattern id="s1_p"/><path fill="url(#s1_p)"/><use xlink:href="#s1_p"/>',
    );
  });
});
