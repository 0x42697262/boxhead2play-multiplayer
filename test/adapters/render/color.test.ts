import { describe, expect, it } from 'vitest';
import { applyColorTransform, concatColor, IDENTITY_COLOR, isAlphaOnly, splitAlpha } from '../../../src/adapters/render/color/colorTransform.ts';
import { effectPadding, pixelEffects } from '../../../src/adapters/render/color/filters.ts';
import { applyColorMatrix, applyGlow, applyGradientGlow, boxBlur, gradientLookup, rgbFromNumber } from '../../../src/adapters/render/color/pixelFilters.ts';

function square(size: number, inner: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const start = (size - inner) / 2;
  for (let y = start; y < start + inner; y++) {
    for (let x = start; x < start + inner; x++) pixels.set([255, 255, 255, 255], (y * size + x) * 4);
  }
  return pixels;
}

describe('color transforms', () => {
  it('concatenate the child first, then the parent', () => {
    const parent = { ...IDENTITY_COLOR, rMult: 0.5, rAdd: 10 };
    const child = { ...IDENTITY_COLOR, rMult: 0.5, rAdd: 20, aMult: 0.5 };
    const combined = concatColor(parent, child);
    expect(combined.rMult).toBe(0.25);
    expect(combined.rAdd).toBe(20);
    expect(combined.aMult).toBe(0.5);
  });

  it('separate alpha-only transforms from tints', () => {
    expect(isAlphaOnly({ ...IDENTITY_COLOR, aMult: 0.8 })).toBe(true);
    expect(splitAlpha({ ...IDENTITY_COLOR, aMult: 0.8 })).toEqual({ alpha: 0.8, color: undefined });
    const tint = { ...IDENTITY_COLOR, rMult: 0.289, rAdd: 72 };
    expect(splitAlpha(tint)).toEqual({ alpha: 1, color: tint });
  });

  it('apply multiply then add with clamping', () => {
    const pixels = new Uint8ClampedArray([200, 100, 50, 255]);
    applyColorTransform(pixels, { rMult: 0.5, gMult: 2, bMult: 1, aMult: 0.5, rAdd: 10, gAdd: 0, bAdd: -60, aAdd: 0 });
    expect([...pixels]).toEqual([110, 200, 0, 128]);
  });
});

describe('pixel filters', () => {
  it('box blur keeps the total for interior content', () => {
    const channel = new Float32Array(25);
    channel[12] = 1;
    const blurred = boxBlur(channel, 5, 5, 2, 2, 1);
    expect(blurred.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(blurred[12]).toBeCloseTo(1 / 9);
  });

  it('an outer glow keeps the source and adds a dark rim', () => {
    const pixels = square(8, 4);
    applyGlow(pixels, 8, 8, { color: rgbFromNumber(0), colorAlpha: 1, blurX: 4, blurY: 4, strength: 2, passes: 1 });
    const centre = (4 * 8 + 4) * 4;
    expect([...pixels.slice(centre, centre + 4)]).toEqual([255, 255, 255, 255]);
    const rim = (4 * 8 + 1) * 4;
    expect(pixels[rim + 3]).toBeGreaterThan(0);
    expect(pixels[rim]).toBe(0);
  });

  it('hideObject leaves only the shadow at its strength', () => {
    const pixels = square(8, 4);
    applyGlow(pixels, 8, 8, { color: rgbFromNumber(0), colorAlpha: 1, blurX: 4, blurY: 4, strength: 0.25, passes: 1, hideObject: true });
    const centre = (4 * 8 + 4) * 4;
    expect(pixels[centre]).toBe(0);
    expect(pixels[centre + 3]).toBeLessThanOrEqual(64);
    expect(pixels[centre + 3]).toBeGreaterThan(0);
  });

  it('applies a brightness color matrix', () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255]);
    applyColorMatrix(pixels, [1, 0, 0, 0, 76, 0, 1, 0, 0, 76, 0, 0, 1, 0, 76, 0, 0, 0, 1, 0]);
    expect([...pixels]).toEqual([86, 96, 106, 255]);
  });

  it('parses glow and drop shadow filters and ignores bevels', () => {
    const effects = pixelEffects([
      { type: 'glow', blurX: 2, blurY: 2, strength: 10, passes: 1, glowColor: { r: 0, g: 0, b: 0, a: 255 }, compositeSource: true },
      { type: 'dropShadow', blurX: 5, blurY: 5, distance: 5, angle: Math.PI / 4, strength: 1, passes: 1 },
      { type: 'bevel', blurX: 2 },
    ]);
    expect(effects.map((effect) => effect.kind)).toEqual(['glow', 'glow']);
    expect(effectPadding(effects)).toBeGreaterThan(5);
  });
});

describe('gradient glow', () => {
  const rocketGlow = {
    type: 'gradientGlow',
    blurX: 16,
    blurY: 16,
    strength: 2.3984375,
    passes: 1,
    distance: 0,
    angle: 5.97,
    compositeSource: true,
    knockout: false,
    innerShadow: false,
    onTop: false,
    gradientColors: [
      { r: 255, g: 255, b: 0, a: 0 },
      { r: 255, g: 255, b: 255, a: 255 },
    ],
    gradientRatio: [0, 210],
  } as const;

  it('interpolates the gradient and holds the last stop', () => {
    const table = gradientLookup([
      { ratio: 0, r: 255, g: 255, b: 0, a: 0 },
      { ratio: 210, r: 255, g: 255, b: 255, a: 255 },
    ]);
    expect([...table.slice(0, 4)]).toEqual([255, 255, 0, 0]);
    expect(table[105 * 4 + 3]).toBeCloseTo(128, -1);
    expect([...table.slice(255 * 4, 256 * 4)]).toEqual([255, 255, 255, 255]);
  });

  it('turns the rocket filter into a halo that merges nearby dots', () => {
    const effects = pixelEffects([rocketGlow]);
    expect(effects.map((effect) => effect.kind)).toEqual(['gradientGlow']);
    expect(effectPadding(effects)).toBe(16);
    const size = 24;
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (const [x, y] of [[9, 12], [14, 12]] as const) pixels.set([255, 255, 255, 255], (y * size + x) * 4);
    const effect = effects[0];
    if (effect?.kind !== 'gradientGlow') throw new Error('expected a gradient glow');
    applyGradientGlow(pixels, size, size, effect.options);
    const between = (12 * size + 11) * 4;
    expect(pixels[between + 3]).toBeGreaterThan(0);
    expect(pixels[3]).toBe(0);
  });
});
