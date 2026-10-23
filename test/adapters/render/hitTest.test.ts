import { describe, expect, it } from 'vitest';
import type { DisplayItem, SymbolsCatalog } from '../../../src/adapters/assets/schemas.ts';
import { invert, multiply } from '../../../src/adapters/render/geometry/Matrix.ts';
import { hitAreaContains, instanceHitArea, type HitArea } from '../../../src/adapters/render/symbols/hitTest.ts';
import { ButtonState, SymbolLibrary } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';

function item(depth: number, characterId: number, matrix: DisplayItem['matrix'], name?: string): DisplayItem {
  return { depth, characterId, instance: depth, matrix, ...(name === undefined ? {} : { name }) };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing');
  return value;
}

const rect = (xMin: number, yMin: number, xMax: number, yMax: number) => ({ xMin, yMin, xMax, yMax });

const CATALOG: SymbolsCatalog = {
  formatVersion: 1,
  stage: { width: 640, height: 480, frameRate: 50 },
  exports: {},
  classes: {},
  shapes: {
    '1': { bounds: rect(0, 0, 10, 10), svg: 'shapes/1.svg' },
    '2': { bounds: rect(-5, -5, 5, 5), svg: 'shapes/2.svg' },
    '3': { bounds: rect(0, 0, 100, 20), svg: 'shapes/3.svg' },
  },
  morphShapes: {},
  texts: {},
  editTexts: {},
  buttons: {
    '20': {
      trackAsMenu: false,
      bounds: rect(0, 0, 10, 10),
      records: [
        { states: ['up', 'down'], characterId: 1, depth: 1, matrix: [1, 0, 0, 1, 0, 0] },
        { states: ['over'], characterId: 3, depth: 1, matrix: [1, 0, 0, 1, 0, 0] },
        { states: ['hitTest'], characterId: 2, depth: 1, matrix: [4, 0, 0, 1, 0, 0] },
      ],
      conditions: [],
    },
  },
  sprites: {
    '10': {
      frameCount: 2,
      frames: [[item(1, 3, [1, 0, 0, 1, 0, 0]), item(2, 20, [1, 0, 0, 1, 50, 10], '_Button')], [item(1, 1, [1, 0, 0, 1, 0, 0])]],
      frameBounds: [rect(0, 0, 100, 20), rect(0, 0, 10, 10)],
    },
    '11': { frameCount: 1, frames: [[item(1, 1, [2, 0, 0, 2, 0, 0])]], frameBounds: [rect(0, 0, 20, 20)] },
  },
  root: { frameCount: 1, frames: [[]], frameBounds: [null] },
};

const ROOT: readonly DisplayItem[] = [item(1, 10, [2, 0, 0, 2, 100, 100], 'panel'), item(2, 11, [0, 1, -1, 0, 300, 50], 'turned')];

describe('hit testing with transformed bounds', () => {
  const library = new SymbolLibrary(CATALOG);

  it('uses the hitTest record bounds of a button through every parent matrix', () => {
    const area: HitArea = required(instanceHitArea(library, ROOT, ['panel', '_Button'], {}));
    expect(area.local).toEqual(rect(-20, -5, 20, 5));
    expect(area.matrix).toEqual([2, 0, 0, 2, 200, 120]);
    expect(hitAreaContains(area, { x: 161, y: 111 })).toBe(true);
    expect(hitAreaContains(area, { x: 239, y: 129 })).toBe(true);
    expect(hitAreaContains(area, { x: 241, y: 120 })).toBe(false);
    expect(hitAreaContains(area, { x: 200, y: 131 })).toBe(false);
  });

  it('maps the point back through a rotation instead of testing an axis-aligned box', () => {
    const area: HitArea = required(instanceHitArea(library, ROOT, ['turned'], {}));
    expect(area.local).toEqual(rect(0, 0, 20, 20));
    expect(hitAreaContains(area, { x: 290, y: 60 })).toBe(true);
    expect(hitAreaContains(area, { x: 310, y: 60 })).toBe(false);
  });

  it('follows matrix overrides, replaced characters and hidden parents', () => {
    const moved = instanceHitArea(library, ROOT, ['panel', '_Button'], { panel: { matrix: [1, 0, 0, 1, 0, 0] } });
    expect(moved?.matrix).toEqual([1, 0, 0, 1, 50, 10]);
    expect(instanceHitArea(library, ROOT, ['panel', '_Button'], { panel: { visible: false } })).toBeUndefined();
    expect(instanceHitArea(library, ROOT, ['turned', '_Button'], { turned: { characterId: 10 } })).toBeDefined();
    expect(instanceHitArea(library, ROOT, ['panel', '_Button'], { panel: { frame: 1 } })).toBeUndefined();
  });

  it('finds attached children and measures button states', () => {
    const attached = item(5, 20, [1, 0, 0, 1, 0, 0], 'extra');
    const area = required(instanceHitArea(library, ROOT, ['turned', 'extra'], { turned: { attach: [attached] } }));
    expect(area.matrix).toEqual(multiply([0, 1, -1, 0, 300, 50], [1, 0, 0, 1, 0, 0]));
    expect(library.instanceBounds(20, { buttonState: ButtonState.Over })).toEqual(rect(0, 0, 100, 20));
    expect(library.instanceBounds(20, undefined)).toEqual(rect(0, 0, 10, 10));
  });

  it('inverts matrices', () => {
    const m = [2, 1, -1, 3, 10, 20] as const;
    const inverse = invert(m);
    const identity = multiply(m, required(inverse));
    identity.forEach((value, index) => expect(value).toBeCloseTo([1, 0, 0, 1, 0, 0][index] ?? 0));
    expect(invert([0, 0, 0, 0, 1, 1])).toBeUndefined();
  });
});
