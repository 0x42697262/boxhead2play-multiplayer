import { describe, expect, it } from 'vitest';
import { ClipBuffers } from '../../../src/adapters/render/clips/ClipBuffers.ts';
import { placed, recordingRenderer, RecordingSurfaces, spriteOf, squareShape, symbolsCatalog } from './support/recordingSurfaces.ts';

const SYMBOL = 'Decal.Blood';

function clips() {
  const surfaces = new RecordingSurfaces();
  const catalog = symbolsCatalog({ exports: { [SYMBOL]: 2 }, shapes: { '1': squareShape('blood.svg') }, sprites: { '2': spriteOf([[placed(1, 1)]]) } });
  return { surfaces, buffers: new ClipBuffers(recordingRenderer(catalog, surfaces)) };
}

const UNIT_SCALE = { x: 1, y: 1 };

describe('clip buffers', () => {
  it('render a frame once and reuse it', () => {
    const { surfaces, buffers } = clips();
    const first = buffers.directionalFrame(SYMBOL, 1, 0, 0, UNIT_SCALE);
    expect(buffers.directionalFrame(SYMBOL, 1, 0, 0, UNIT_SCALE)).toBe(first);
    expect(surfaces.created).toHaveLength(1);
  });

  it('render again at the new size after a resolution change', () => {
    const { surfaces, buffers } = clips();
    const first = buffers.directionalFrame(SYMBOL, 1, 0, 0, UNIT_SCALE);
    buffers.setResolution(2);
    expect(buffers.size).toBe(0);
    const second = buffers.directionalFrame(SYMBOL, 1, 0, 0, UNIT_SCALE);
    expect(surfaces.created).toHaveLength(2);
    expect(second?.surface.width).toBe((first?.surface.width ?? 0) * 2);
    expect(second?.dispX).toBe((first?.dispX ?? 0) * 2);
  });
});
