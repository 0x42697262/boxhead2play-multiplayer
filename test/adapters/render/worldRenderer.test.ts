import { describe, expect, it } from 'vitest';
import { ClipBuffers } from '../../../src/adapters/render/clips/ClipBuffers.ts';
import { HudRenderer } from '../../../src/adapters/render/hud/HudRenderer.ts';
import { CLIP_BUFFER_INFLATE_PX } from '../../../src/adapters/render/tuning.ts';
import { VisualPainter } from '../../../src/adapters/render/world/VisualPainter.ts';
import { WorldRenderer, type EffectPreferences } from '../../../src/adapters/render/world/WorldRenderer.ts';
import { XsiFrameCache } from '../../../src/adapters/render/xsi/XsiFrameCache.ts';
import { DecalKind } from '../../../src/domain/events.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { decal, emptyWorldFrame, emptyXsi, FakeRasterizer, TEST_ROOM } from './support/fixtures.ts';
import { placed, recordingRenderer, RecordingSurfaces, spriteOf, squareShape, symbolsCatalog, type RecordingSurface } from './support/recordingSurfaces.ts';

const BLOOD = 'Decal.Blood';
const SCORCH = 'Decal.Scorch';

function setup() {
  const surfaces = new RecordingSurfaces();
  const catalog = symbolsCatalog({
    exports: { [BLOOD]: 2, [SCORCH]: 4 },
    shapes: { '1': squareShape('blood.svg'), '3': squareShape('scorch.svg') },
    sprites: { '2': spriteOf([[placed(1, 1)]]), '4': spriteOf([[placed(3, 1)]]) },
  });
  const renderer = recordingRenderer(catalog, surfaces);
  const clips = new ClipBuffers(renderer);
  const painter = new VisualPainter(clips, new XsiFrameCache(emptyXsi(), new FakeRasterizer(surfaces)));
  const view = { resolution: 1, effects: { screenShake: true, blood: true } as EffectPreferences };
  const world = new WorldRenderer(TEST_ROOM, renderer, clips, painter, new HudRenderer(renderer, GameMode.Single), {
    detail: false,
    resolution: () => view.resolution,
    effects: () => view.effects,
  });
  const floor = (): RecordingSurface => {
    const surface = surfaces.owner(world.floor.canvas);
    if (!surface) throw new Error('floor is not a recorded surface');
    return surface;
  };
  const stamps = () => floor().calls.filter((call) => call.method === 'drawImage');
  const stampPositions = () => stamps().map((call) => [call.args[5], call.args[6]]);
  return { surfaces, world, view, stamps, stampPositions };
}

function stampAt(xPx: number, yPx: number, resolution: number): [number, number] {
  const disp = Math.floor(-CLIP_BUFFER_INFLATE_PX * resolution);
  return [Math.floor(xPx * resolution + disp), Math.floor(yPx * resolution + disp)];
}

describe('world renderer planes and decals', () => {
  it('stamps every decal through one reused scratch surface', () => {
    const { world, stamps, stampPositions } = setup();
    world.stampDecal(decal(DecalKind.BloodSplat, BLOOD, 5, 5));
    world.stampDecal(decal(DecalKind.ScorchMark, SCORCH, 30, 20));
    world.stampDecal(decal(DecalKind.BloodSplat, BLOOD, 40, 10));
    expect(stampPositions()).toEqual([stampAt(5, 5, 1), stampAt(30, 20, 1), stampAt(40, 10, 1)]);
    expect(new Set(stamps().map((call) => call.args[0])).size).toBe(1);
  });

  it('rebuilds the planes at the new resolution and stamps the decals again', () => {
    const { world, view, stampPositions } = setup();
    world.stampDecal(decal(DecalKind.BloodSplat, BLOOD, 5, 5));
    world.stampDecal(decal(DecalKind.ScorchMark, SCORCH, 30, 20));
    const before = world.floor;
    view.resolution = 2;
    world.render(emptyWorldFrame());
    expect(world.floor).not.toBe(before);
    expect([world.floor.width, world.floor.height]).toEqual([TEST_ROOM.size.width * 2, TEST_ROOM.size.height * 2]);
    expect([world.screen.width, world.screen.height]).toEqual([640 * 2, 480 * 2]);
    expect(stampPositions()).toEqual([stampAt(5, 5, 2), stampAt(30, 20, 2)]);
  });

  it('restamps only scorch marks when blood is switched off, and blood again when it is back on', () => {
    const { world, view, stampPositions } = setup();
    world.stampDecal(decal(DecalKind.BloodSplat, BLOOD, 5, 5));
    world.stampDecal(decal(DecalKind.ScorchMark, SCORCH, 30, 20));
    view.effects = { screenShake: true, blood: false };
    world.render(emptyWorldFrame());
    expect(stampPositions()).toEqual([stampAt(30, 20, 1)]);
    world.stampDecal(decal(DecalKind.BloodSplat, BLOOD, 40, 10));
    expect(stampPositions()).toEqual([stampAt(30, 20, 1)]);
    view.effects = { screenShake: true, blood: true };
    world.render(emptyWorldFrame());
    expect(stampPositions()).toEqual([stampAt(5, 5, 1), stampAt(30, 20, 1), stampAt(40, 10, 1)]);
  });

  it('does not rebuild anything while the resolution and effects stay the same', () => {
    const { surfaces, world } = setup();
    world.render(emptyWorldFrame());
    const created = surfaces.created.length;
    world.render(emptyWorldFrame());
    expect(surfaces.created.length).toBe(created);
  });
});
