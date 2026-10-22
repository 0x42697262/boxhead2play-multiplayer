import { describe, expect, it } from 'vitest';
import { matrix, place, rect, shape, SHOW_FRAME, sprite, swfIndex, translate } from '../testing/fixtures.ts';
import { toPixelRect } from './geometry.ts';

describe('SwfIndex bounds', () => {
  const index = swfIndex(
    [
      shape(1, rect(0, 0, 32, 32)),
      sprite(2, [place(1, 1, { matrix: matrix(2, 0, 0, 1, -32, 0) }), SHOW_FRAME]),
      sprite(3, [place(1, 2, { matrix: translate(100, 10) }), place(2, 1, { matrix: matrix(0, 1, -1, 0, 0, 0) }), SHOW_FRAME]),
      sprite(4, []),
      {
        kind: 'morphShape',
        id: 5,
        startBounds: rect(0, 0, 10, 10),
        endBounds: rect(0, 0, 30, 10),
        fills: [],
        lines: [],
      },
    ],
    { Nested: 3 },
  );

  it('unions transformed child bounds per frame', () => {
    expect(toPixelRect(index.spriteFrameBounds(2, 0) ?? rect(0, 0, 0, 0))).toEqual({ xMin: -32, yMin: 0, xMax: 32, yMax: 32 });
    expect(toPixelRect(index.spriteFrameBounds(3, 0) ?? rect(0, 0, 0, 0))).toEqual({ xMin: -32, yMin: 0, xMax: 132, yMax: 42 });
  });

  it('reports empty sprites as null', () => {
    expect(index.characterBounds(4)).toBeNull();
  });

  it('interpolates morph bounds by ratio', () => {
    expect(index.characterBounds(5, 65535)).toEqual(rect(0, 0, 30, 10));
  });

  it('looks up linkage names', () => {
    expect(index.linkageOf(3)).toBe('Nested');
    expect(index.linkageOf(2)).toBeUndefined();
  });
});
