import { describe, expect, it } from 'vitest';
import { SymbolsCatalogSchema } from '../../../src/adapters/assets/schemas.ts';
import { matrix, move, place, rect, shape, SHOW_FRAME, sprite, swfIndex } from '../testing/fixtures.ts';
import { buildSymbols } from './buildSymbols.ts';

const shapeSvg = (xMin: number, yMin: number, width: number, height: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px"><g transform="matrix(1.0, 0.0, 0.0, 1.0, ${-xMin}, ${-yMin})"><path d="M0 0"/></g></svg>`;

const MORPH_SVG =
  '<svg><path d="M0 0" fill="#ff0000"><animate attributeName="d" values="M0 0 L10 0;M0 0 L20 0"/></path></svg>';

const index = swfIndex(
  [
    shape(1, rect(-5, -5, 5, 5)),
    {
      kind: 'morphShape',
      id: 2,
      startBounds: rect(0, 0, 10, 1),
      endBounds: rect(0, 0, 20, 1),
      fills: [{ fillStyleType: 0, start: { r: 255, g: 0, b: 0, a: 255 }, end: { r: 255, g: 0, b: 0, a: 255 } }],
      lines: [],
    },
    {
      kind: 'editText',
      id: 3,
      bounds: rect(0, 0, 100, 20),
      variableName: '',
      fontId: 25,
      fontHeight: 200,
      align: 2,
      flags: { html: true, useOutlines: true },
    },
    sprite(10, [
      { kind: 'label', name: 'idle' },
      place(1, 1, { name: 'dot', matrix: matrix(1, 0, 0, 1, 10, 0) }),
      place(2, 2, { ratio: 0 }),
      SHOW_FRAME,
      move(2, { ratio: 65535 }),
      { kind: 'startSound', soundId: 9, syncStop: false, syncNoMultiple: false },
      SHOW_FRAME,
    ]),
  ],
  { Dot: 10 },
);

describe('buildSymbols', () => {
  const output = buildSymbols({
    index,
    classes: new Map([['Dot', 'Example.CDot']]),
    frameScripts: new Map([[10, new Map([[1, 'stop();']])]]),
    selfHiddenSpriteIds: new Set(),
    shapeSvgs: new Map([[1, shapeSvg(-5, -5, 10, 10)]]),
    textSvgs: new Map(),
    morphSvgs: new Map([[2, MORPH_SVG]]),
  });

  it('produces a catalog that satisfies the runtime schema', () => {
    expect(SymbolsCatalogSchema.safeParse(output.catalog).success).toBe(true);
    expect(output.catalog.exports).toEqual({ Dot: 10 });
    expect(output.catalog.classes).toEqual({ Dot: 'Example.CDot' });
  });

  it('records shape bounds and writes normalized SVG files', () => {
    expect(output.catalog.shapes['1']).toEqual({ bounds: { xMin: -5, yMin: -5, xMax: 5, yMax: 5 }, svg: 'shapes/1.svg' });
    expect(output.files.find((file) => file.path === 'shapes/1.svg')?.content).toContain('viewBox="0 0 10 10"');
  });

  it('replays sprite frames with labels, sounds, scripts and bounds', () => {
    const entry = output.catalog.sprites['10'];
    expect(entry?.labels).toEqual({ idle: 0 });
    expect(entry?.frames[1]?.map((item) => [item.depth, item.ratio])).toEqual([
      [1, undefined],
      [2, 65535],
    ]);
    expect(entry?.frames[0]?.[0]).toMatchObject({ name: 'dot', matrix: [1, 0, 0, 1, 10, 0] });
    expect(entry?.frameSounds).toEqual({ '1': [{ characterId: 9, syncStop: false, syncNoMultiple: false }] });
    expect(entry?.scripts).toEqual({ '1': 'stop();' });
    expect(entry?.frameBounds[1]).toEqual({ xMin: 0, yMin: -5, xMax: 20, yMax: 5 });
  });

  it('bakes one SVG per morph ratio used by any timeline', () => {
    expect(Object.keys(output.catalog.morphShapes['2']?.ratios ?? {})).toEqual(['0', '65535']);
    expect(output.files.map((file) => file.path)).toContain('morphs/2_65535.svg');
  });

  it('converts edit text metrics to pixels', () => {
    expect(output.catalog.editTexts['3']).toMatchObject({ fontId: 25, fontSize: 10, align: 'center', html: true, wordWrap: false });
  });
});
