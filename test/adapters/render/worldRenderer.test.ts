import { describe, expect, it } from 'vitest';
import { ClipBuffers } from '../../../src/adapters/render/clips/ClipBuffers.ts';
import { HudRenderer } from '../../../src/adapters/render/hud/HudRenderer.ts';
import { CLIP_BUFFER_INFLATE_PX } from '../../../src/adapters/render/tuning.ts';
import { VisualPainter } from '../../../src/adapters/render/world/VisualPainter.ts';
import { WorldRenderer, type EffectPreferences } from '../../../src/adapters/render/world/WorldRenderer.ts';
import { XsiFrameCache } from '../../../src/adapters/render/xsi/XsiFrameCache.ts';
import { DecalKind } from '../../../src/domain/events.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import type { WorldFrame } from '../../../src/adapters/render/world/WorldFrame.ts';
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
  const view = { resolution: 1, planeResolution: undefined as number | undefined, effects: { screenShake: true, blood: true, flashes: true } as EffectPreferences };
  const world = new WorldRenderer(TEST_ROOM, renderer, clips, painter, new HudRenderer(renderer, GameMode.Single), {
    detail: false,
    resolution: () => view.resolution,
    planeResolution: (screenResolution) => view.planeResolution ?? screenResolution,
    effects: () => view.effects,
  });
  const floor = (): RecordingSurface => {
    const surface = surfaces.owner(world.floor.canvas);
    if (!surface) throw new Error('floor is not a recorded surface');
    return surface;
  };
  const stamps = () => floor().calls.filter((call) => call.method === 'drawImage');
  const stampPositions = () => stamps().map((call) => [call.args[5], call.args[6]]);
  const screen = (): RecordingSurface => {
    const surface = surfaces.owner(world.screen.canvas);
    if (!surface) throw new Error('screen is not a recorded surface');
    return surface;
  };
  return { surfaces, world, view, stamps, stampPositions, screen };
}

function cameraFrame(drawOrigin: { x: number; y: number }): WorldFrame {
  const view = { playerIndex: 0, rect: { x: drawOrigin.x, y: drawOrigin.y, width: 640, height: 480 }, drawOrigin };
  return { ...emptyWorldFrame(), cameras: [{ view, entries: [] }] };
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
    view.effects = { screenShake: true, blood: false, flashes: true };
    world.render(emptyWorldFrame());
    expect(stampPositions()).toEqual([stampAt(30, 20, 1)]);
    world.stampDecal(decal(DecalKind.BloodSplat, BLOOD, 40, 10));
    expect(stampPositions()).toEqual([stampAt(30, 20, 1)]);
    view.effects = { screenShake: true, blood: true, flashes: true };
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

  it('builds the planes at the plane resolution, frees the pieces surface and draws the planes scaled to the screen', () => {
    const { surfaces, world, view, screen } = setup();
    const released = () => surfaces.created.filter((surface) => surface.canvas.width === 0);
    expect(released()).toHaveLength(1);
    expect(released()[0]?.canvas).not.toBe(world.floor.canvas);
    view.resolution = 2;
    view.planeResolution = 1;
    world.render(cameraFrame({ x: 10, y: 4 }));
    expect([world.screen.width, world.floor.width, world.floor.height, world.planeResolution]).toEqual([1280, TEST_ROOM.size.width, TEST_ROOM.size.height, 1]);
    const floorCopy = screen().calls.find((call) => call.method === 'drawImage' && call.args[0] === world.floor.canvas);
    expect(floorCopy?.args).toEqual([world.floor.canvas, 10, 4, TEST_ROOM.size.width - 10, TEST_ROOM.size.height - 4, 0, 0, (TEST_ROOM.size.width - 10) * 2, (TEST_ROOM.size.height - 4) * 2]);
  });

  it('stamps decals at the plane resolution while the screen is sharper', () => {
    const { world, view, stampPositions } = setup();
    world.stampDecal(decal(DecalKind.BloodSplat, BLOOD, 5, 5));
    view.resolution = 2;
    view.planeResolution = 1;
    world.render(emptyWorldFrame());
    world.stampDecal(decal(DecalKind.ScorchMark, SCORCH, 30, 20));
    expect(stampPositions()).toEqual([stampAt(5, 5, 1), stampAt(30, 20, 1)]);
  });

  it('rebuilds only the planes when the room detail changes and the screen does not', () => {
    const { world, view } = setup();
    view.resolution = 2;
    world.render(emptyWorldFrame());
    const screenBefore = world.screen;
    const floorBefore = world.floor;
    view.planeResolution = 1;
    world.render(emptyWorldFrame());
    expect(world.screen).toBe(screenBefore);
    expect(world.floor).not.toBe(floorBefore);
    expect(floorBefore.canvas.width).toBe(0);
    expect(world.floor.width).toBe(TEST_ROOM.size.width);
  });

  it('keeps the planes when only the screen resolution changes', () => {
    const { world, view } = setup();
    view.planeResolution = 1;
    const floorBefore = world.floor;
    view.resolution = 2;
    world.render(emptyWorldFrame());
    expect(world.screen.width).toBe(1280);
    expect(world.floor).toBe(floorBefore);
  });
});
