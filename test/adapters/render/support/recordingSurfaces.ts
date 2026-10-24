import type { GraphicSource } from '../../../../src/adapters/assets/GraphicImages.ts';
import { ASSET_FORMAT_VERSION, type DisplayItem, type Sprite, type SymbolsCatalog } from '../../../../src/adapters/assets/schemas.ts';
import type { Context2D, Surface, SurfaceFactory } from '../../../../src/adapters/render/surface.ts';
import { SymbolLibrary } from '../../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { SymbolRenderer } from '../../../../src/adapters/render/symbols/SymbolRenderer.ts';

export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface RecordingSurface extends Surface {
  readonly id: number;
  readonly calls: RecordedCall[];
}

function recordingContext(calls: RecordedCall[]): Context2D {
  const state: Record<string | symbol, unknown> = { measureText: () => ({ width: 0, fontBoundingBoxAscent: 0 }) };
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get: (target, property) =>
      property in target
        ? target[property]
        : (...args: unknown[]) => {
            calls.push({ method: String(property), args });
          },
    set: (target, property, value: unknown) => {
      target[property] = value;
      return true;
    },
  };
  return new Proxy(state, handler) as unknown as Context2D;
}

export class RecordingSurfaces implements SurfaceFactory {
  readonly created: RecordingSurface[] = [];

  create(width: number, height: number): RecordingSurface {
    const id = this.created.length;
    const size = { width: Math.max(1, Math.ceil(width)), height: Math.max(1, Math.ceil(height)) };
    const calls: RecordedCall[] = [];
    const canvas = { ...size, id } as unknown as OffscreenCanvas;
    const surface: RecordingSurface = { id, canvas, ctx: recordingContext(calls), ...size, calls };
    this.created.push(surface);
    return surface;
  }

  owner(canvas: unknown): RecordingSurface | undefined {
    return this.created.find((surface) => surface.canvas === canvas);
  }
}

export const fakeImage = {} as unknown as CanvasImageSource;

export const fakeGraphics: GraphicSource = { image: () => fakeImage };

export const SQUARE_SIZE_PX = 10;

export function squareShape(svg: string) {
  return { bounds: { xMin: 0, yMin: 0, xMax: SQUARE_SIZE_PX, yMax: SQUARE_SIZE_PX }, svg };
}

export function placed(characterId: number, depth: number, name?: string, matrix: DisplayItem['matrix'] = [1, 0, 0, 1, 0, 0]): DisplayItem {
  return { depth, characterId, instance: depth, matrix, ...(name === undefined ? {} : { name }) };
}

export function spriteOf(frames: readonly (readonly DisplayItem[])[]): Sprite {
  return {
    frameCount: frames.length,
    frames: frames.map((items) => [...items]),
    frameBounds: frames.map(() => ({ xMin: 0, yMin: 0, xMax: SQUARE_SIZE_PX, yMax: SQUARE_SIZE_PX })),
  };
}

export function symbolsCatalog(parts: Pick<SymbolsCatalog, 'exports' | 'shapes' | 'sprites'>): SymbolsCatalog {
  return {
    formatVersion: ASSET_FORMAT_VERSION,
    stage: { width: 640, height: 480, frameRate: 25 },
    classes: {},
    morphShapes: {},
    texts: {},
    editTexts: {},
    buttons: {},
    root: spriteOf([]),
    ...parts,
  };
}

export function recordingRenderer(catalog: SymbolsCatalog, surfaces: RecordingSurfaces): SymbolRenderer {
  return new SymbolRenderer(new SymbolLibrary(catalog), fakeGraphics, surfaces, { fontFamily: () => 'sans-serif' });
}
