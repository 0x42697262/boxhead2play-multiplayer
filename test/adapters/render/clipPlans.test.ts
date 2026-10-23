import { describe, expect, it } from 'vitest';
import {
  animationFrameCount,
  directionalRotationDegrees,
  FRONT_CHILD,
  omniAngles,
  omniMatrices,
  planAnimationFrame,
  planDirectionalFrame,
  planOmni,
  planStatic,
  TOP_CHILD,
} from '../../../src/adapters/render/clips/clipPlans.ts';
import { SymbolLibrary } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { assetsMissing, assetSymbols } from '../assets/support.ts';

function library(): SymbolLibrary {
  return new SymbolLibrary(assetSymbols());
}

function idOf(lib: SymbolLibrary, linkage: string): number {
  const id = lib.characterId(linkage);
  if (id === undefined) throw new Error(linkage);
  return id;
}

describe('omni-directional buffering', () => {
  it('pre-renders 8 angles for 8 directions', () => {
    expect(omniAngles(8)).toHaveLength(8);
  });

  it('squashes _Top to half height and stands _Front up at angle 0', () => {
    const { top, front } = omniMatrices(0);
    expect(top).toEqual([1, 0, 0, 0.5, 0, 0]);
    expect(front[0]).toBeCloseTo(0);
    expect(front.slice(1)).toEqual([0.5, 0, 0.5, 0, 0]);
  });

  it('skews _Top for a quarter turn like the original float math', () => {
    const { top } = omniMatrices(Math.PI / 2);
    expect(top[1]).toBeCloseTo(0.5);
    expect(top[2]).toBeCloseTo(-1);
    expect(top[3]).toBeCloseTo(0);
  });
});

describe('clip buffer plans against the real library', () => {
  it.skipIf(assetsMissing)('a static barrel is inflated by 8 pixels', () => {
    const lib = library();
    const id = idOf(lib, 'Object.Barrel');
    const plan = planStatic(lib, id);
    const bounds = lib.localBounds(id);
    expect(bounds).not.toBeNull();
    expect(plan.layout.dispX).toBe(Math.floor(bounds?.xMin ?? 0) - 8);
    expect(plan.layout.width).toBe(Math.ceil(bounds?.xMax ?? 0) - Math.floor(bounds?.xMin ?? 0) + 16);
  });

  it.skipIf(assetsMissing)('animations step the _Contents child when there is one', () => {
    const lib = library();
    const fireBall = idOf(lib, 'Effect.FireBall');
    expect(animationFrameCount(lib, fireBall)).toBe(16);
    expect(planAnimationFrame(lib, fireBall, 5).overrides).toEqual({ _Contents: { frame: 5 } });
    const explosion = idOf(lib, 'Effect.Explosion');
    expect(animationFrameCount(lib, explosion)).toBe(18);
    expect(planAnimationFrame(lib, explosion, 5)).toMatchObject({ frame: 5 });
  });

  it.skipIf(assetsMissing)('decals rotate _Contents by 120 degrees and squash to 0.6', () => {
    const lib = library();
    const splat = idOf(lib, 'Effect.BloodSplat');
    expect(directionalRotationDegrees(1, 3)).toBe(120);
    const plan = planDirectionalFrame(lib, splat, 3, 1, 2, { x: 1, y: 0.6 });
    const matrix = plan.overrides?._Contents?.matrix;
    expect(matrix?.[0]).toBeCloseTo(-0.5);
    expect(plan.overrides?._Contents?.frame).toBe(2);
    expect(plan.layout.matrix[3]).toBe(0.6);
  });

  it.skipIf(assetsMissing)('muzzle flashes override _Top and _Front', () => {
    const lib = library();
    const plan = planOmni(lib, idOf(lib, 'Pistol.MuzzleFlash'), Math.PI / 4);
    expect(Object.keys(plan.overrides ?? {}).sort()).toEqual([FRONT_CHILD, TOP_CHILD].sort());
  });
});
