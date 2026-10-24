import { describe, expect, it } from 'vitest';
import { XsiFrameCache } from '../../../src/adapters/render/xsi/XsiFrameCache.ts';
import { CharacterStyle } from '../../../src/domain/visuals.ts';
import { emptyXsi, FakeRasterizer } from './support/fixtures.ts';
import { RecordingSurfaces } from './support/recordingSurfaces.ts';

const SET_ID = 'Zombie_Walk';
const FRAMES_PER_DIRECTION = 2;
const DIRECTIONS = 2;
const FRAME_COUNT = FRAMES_PER_DIRECTION * DIRECTIONS;

function cache() {
  const direction = Array.from({ length: FRAMES_PER_DIRECTION }, () => ({ Models: {} }));
  const xsi = emptyXsi({
    [SET_ID]: { groupId: 'Zombie', animId: 'Walk', tilt: 0, light: { mX: 0, mY: 0, mZ: 1 }, materials: {}, directions: Array.from({ length: DIRECTIONS }, () => direction) },
  });
  const rasterizer = new FakeRasterizer(new RecordingSurfaces());
  return { frames: new XsiFrameCache(xsi, rasterizer), rasterizer };
}

const always = () => true;

describe('XSI frame cache', () => {
  it('queues every frame of a collection and renders them in idle time', () => {
    const { frames, rasterizer } = cache();
    frames.enqueue({ style: CharacterStyle.Zombie, styleScale: 1, setIds: [SET_ID] });
    expect(frames.pending).toBe(FRAME_COUNT);
    expect(frames.prewarm(always)).toBe(FRAME_COUNT);
    expect(frames.pending).toBe(0);
    expect(rasterizer.rasterizedAt).toEqual(Array.from({ length: FRAME_COUNT }, () => 1));
  });

  it('queues the rendered frames again after a resolution change and renders them at the new resolution', () => {
    const { frames, rasterizer } = cache();
    frames.enqueue({ style: CharacterStyle.Zombie, styleScale: 1, setIds: [SET_ID] });
    frames.prewarm(always);
    frames.setResolution(2);
    expect(frames.size).toBe(0);
    expect(frames.pending).toBe(FRAME_COUNT);
    expect(frames.prewarm(always)).toBe(FRAME_COUNT);
    expect(frames.size).toBe(FRAME_COUNT);
    expect(rasterizer.rasterizedAt.slice(FRAME_COUNT)).toEqual(Array.from({ length: FRAME_COUNT }, () => 2));
  });

  it('keeps the cache and the queue when the resolution does not change', () => {
    const { frames } = cache();
    frames.enqueue({ style: CharacterStyle.Zombie, styleScale: 1, setIds: [SET_ID] });
    frames.prewarm(always);
    frames.setResolution(1);
    expect(frames.size).toBe(FRAME_COUNT);
    expect(frames.pending).toBe(0);
  });
});
