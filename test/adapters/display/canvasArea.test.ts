import { describe, expect, it } from 'vitest';
import { CanvasAreaLimit, readDeviceHint } from '../../../src/adapters/display/canvasArea.ts';

const SAFARI_MAX_AREA = 16_777_216;

function safariProbe() {
  const probed: number[] = [];
  const probe = (width: number, height: number): boolean => {
    probed.push(width * height);
    return width * height <= SAFARI_MAX_AREA;
  };
  return { probe, probed };
}

describe('canvas area limit', () => {
  it('steps down to the largest candidate the browser draws, then answers from its cache', () => {
    const { probe, probed } = safariProbe();
    const limit = new CanvasAreaLimit(probe);
    expect(limit.usableArea(39_000_000)).toBe(SAFARI_MAX_AREA);
    expect(probed).toHaveLength(3);
    expect(limit.usableArea(39_000_000)).toBe(SAFARI_MAX_AREA);
    expect(limit.usableArea(10_000_000)).toBe(10_000_000);
    expect(probed).toHaveLength(3);
  });

  it('probes nothing above the area that is asked for', () => {
    const { probe, probed } = safariProbe();
    expect(new CanvasAreaLimit(probe).usableArea(1_000_000)).toBe(1_000_000);
    expect(probed).toEqual([1_000_000]);
  });
});

describe('device hint', () => {
  it('reads device memory where the browser has it and treats touch screens as phones', () => {
    const navigator = (fields: object) => ({ maxTouchPoints: 0, ...fields }) as unknown as Navigator;
    expect(readDeviceHint({ navigator: navigator({ deviceMemory: 4 }), coarsePointer: false })).toEqual({ memoryGiB: 4, touch: false });
    expect(readDeviceHint({ navigator: navigator({}), coarsePointer: true })).toEqual({ memoryGiB: undefined, touch: true });
    expect(readDeviceHint({ navigator: navigator({ maxTouchPoints: 5 }), coarsePointer: false })).toEqual({ memoryGiB: undefined, touch: true });
  });
});
