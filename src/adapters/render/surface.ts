import { BYTE_MASK, GREEN_SHIFT, RED_SHIFT, SURFACE_MIN_SIZE } from './tuning.ts';

export type Context2D = OffscreenCanvasRenderingContext2D;

export interface Surface {
  readonly canvas: OffscreenCanvas;
  readonly ctx: Context2D;
  readonly width: number;
  readonly height: number;
}

export interface SurfaceFactory {
  create(width: number, height: number): Surface;
}

export class CanvasUnavailableError extends Error {}

export const offscreenSurfaces: SurfaceFactory = {
  create(width, height) {
    const canvas = new OffscreenCanvas(Math.max(SURFACE_MIN_SIZE, Math.ceil(width)), Math.max(SURFACE_MIN_SIZE, Math.ceil(height)));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new CanvasUnavailableError('OffscreenCanvas 2d');
    return { canvas, ctx, width: canvas.width, height: canvas.height };
  },
};

export interface BufferedBitmap {
  readonly surface: Surface;
  readonly dispX: number;
  readonly dispY: number;
}

export function resetContext(ctx: Context2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}

export function readPixels(surface: Surface): ImageData | undefined {
  try {
    return surface.ctx.getImageData(0, 0, surface.width, surface.height);
  } catch {
    return undefined;
  }
}

export function cssColor(color: number, alpha = 1): string {
  const r = (color >> RED_SHIFT) & BYTE_MASK;
  const g = (color >> GREEN_SHIFT) & BYTE_MASK;
  const b = color & BYTE_MASK;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
