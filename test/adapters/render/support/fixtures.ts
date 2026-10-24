import { ASSET_FORMAT_VERSION, type Room, type XsiCatalog } from '../../../../src/adapters/assets/schemas.ts';
import type { FrameRasterizer } from '../../../../src/adapters/render/xsi/XsiFrameCache.ts';
import { DomainEventType, type DecalKind, type DecalRequested } from '../../../../src/domain/events.ts';
import type { HudFrame, WorldFrame } from '../../../../src/adapters/render/world/WorldFrame.ts';
import { GameMode } from '../../../../src/domain/world/GameMode.ts';
import type { RecordingSurfaces } from './recordingSurfaces.ts';

export const TEST_ROOM: Room = {
  formatVersion: ASSET_FORMAT_VERSION,
  id: 'ROOM_Test',
  characterId: 0,
  size: { width: 64, height: 48 },
  background: [],
  pieces: [],
  initObjects: [],
  hiddenCharacterIds: [],
};

export function emptyXsi(sets: XsiCatalog['sets'] = {}): XsiCatalog {
  return { formatVersion: ASSET_FORMAT_VERSION, globalScale: 1, setOrder: Object.keys(sets), materials: {}, textureLinkages: {}, sets };
}

export class FakeRasterizer implements FrameRasterizer {
  resolution = 1;
  readonly rasterizedAt: number[] = [];

  constructor(private readonly surfaces: RecordingSurfaces) {}

  setResolution(resolution: number): void {
    this.resolution = resolution;
  }

  rasterize(): ReturnType<FrameRasterizer['rasterize']> {
    this.rasterizedAt.push(this.resolution);
    return { surface: this.surfaces.create(this.resolution, this.resolution), dispX: 0, dispY: 0 };
  }
}

export function decal(kind: DecalKind, symbol: string, xPx: number, yPx: number): DecalRequested {
  return { type: DomainEventType.DecalRequested, decal: kind, symbol, xPx, yPx, frame: 0, rotationIndex: 0, rotationCount: 1, scaleX: 1, scaleY: 1 };
}

export function hudFrame(overrides: Partial<HudFrame> = {}): HudFrame {
  return { localPlayerIndex: 0, playerNames: {}, totalScore: 0, multiplier: 1, multiplierTickRatio: 0, frags: [], deaths: [], messages: [], players: [], upgrades: [], ...overrides };
}

export function emptyWorldFrame(hud: HudFrame = hudFrame()): WorldFrame {
  return { gameMode: GameMode.Single, localPlayerIndex: 0, cameras: [], brightness: 0, projectionFactor: 0, tick: 0, ticksPerSecond: 25, hud };
}
