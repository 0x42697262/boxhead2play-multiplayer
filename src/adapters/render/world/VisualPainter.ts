import type { Point2 } from '../../../domain/events.ts';
import {
  ClipMode,
  OPAQUE_ALPHA,
  VisualKind,
  type ClipVisual,
  type DrawEntry,
  type LineVisual,
  type SquareVisual,
  type Visual,
} from '../../../domain/visuals.ts';
import type { ClipBuffers } from '../clips/ClipBuffers.ts';
import { UNIT_BUFFER_SCALE } from '../clips/clipPlans.ts';
import { cssColor, resetContext, type BufferedBitmap, type Context2D } from '../surface.ts';
import { ALPHA_PERCENT } from '../tuning.ts';
import type { XsiFrameCache } from '../xsi/XsiFrameCache.ts';
import { omniIndex, pixelSnap, roundedScreenPoint, thingScreenPoint } from './projection.ts';

export const SQUARE_LINE_WIDTH_PX = 1;
const UNIT_SCALE = 1;
const DEFAULT_ROTATION_COUNT = 1;

type OverlayVisual = LineVisual | SquareVisual;

export interface PaintContext {
  readonly drawOrigin: Point2;
  readonly projectionFactor: number;
}

export function blit(ctx: Context2D, bitmap: BufferedBitmap, position: Point2, scale: number, alphaPercent: number, resolution = 1): void {
  if (alphaPercent <= 0) return;
  const x = position.x * resolution;
  const y = position.y * resolution;
  if (alphaPercent >= OPAQUE_ALPHA && scale === UNIT_SCALE) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(bitmap.surface.canvas, pixelSnap(x + bitmap.dispX), pixelSnap(y + bitmap.dispY));
    return;
  }
  ctx.setTransform(scale, 0, 0, scale, x + bitmap.dispX * scale, y + bitmap.dispY * scale);
  ctx.globalAlpha = Math.min(alphaPercent, OPAQUE_ALPHA) / ALPHA_PERCENT;
  ctx.drawImage(bitmap.surface.canvas, 0, 0);
}

export class VisualPainter {
  constructor(
    private readonly clips: ClipBuffers,
    private readonly characters: XsiFrameCache,
  ) {}

  get resolution(): number {
    return this.clips.resolution;
  }

  setResolution(resolution: number): void {
    this.clips.setResolution(resolution);
    this.characters.setResolution(resolution);
  }

  paint(ctx: Context2D, entries: readonly DrawEntry[], context: PaintContext): void {
    const overlays: OverlayVisual[] = [];
    for (const entry of entries) this.visual(ctx, entry.visual, context, overlays);
    for (const overlay of overlays) this.overlay(ctx, overlay, context);
    resetContext(ctx);
  }

  private visual(ctx: Context2D, visual: Visual, context: PaintContext, overlays: OverlayVisual[]): void {
    switch (visual.kind) {
      case VisualKind.Character: {
        const bitmap = this.characters.frame(visual);
        if (bitmap) blit(ctx, bitmap, thingScreenPoint(visual.position, context.drawOrigin, context.projectionFactor), UNIT_SCALE, visual.alpha, this.resolution);
        return;
      }
      case VisualKind.Clip: {
        const bitmap = this.clipBitmap(visual);
        if (!bitmap) return;
        const scale = visual.mode === ClipMode.Animation || visual.mode === ClipMode.Directional ? visual.scale : UNIT_SCALE;
        blit(ctx, bitmap, thingScreenPoint(visual.position, context.drawOrigin, context.projectionFactor), scale, visual.alpha, this.resolution);
        return;
      }
      case VisualKind.Line:
      case VisualKind.Square:
        overlays.push(visual);
        return;
      case VisualKind.Group:
        for (const item of visual.items) this.visual(ctx, item, context, overlays);
        return;
    }
  }

  private clipBitmap(visual: ClipVisual): BufferedBitmap | undefined {
    const rotationCount = visual.rotationCount ?? DEFAULT_ROTATION_COUNT;
    switch (visual.mode) {
      case ClipMode.Static:
        return this.clips.staticClip(visual.symbol);
      case ClipMode.Animation:
        return this.clips.animationFrame(visual.symbol, visual.frame);
      case ClipMode.Directional:
        return this.clips.directionalFrame(visual.symbol, rotationCount, visual.rotationIndex ?? 0, visual.frame, UNIT_BUFFER_SCALE);
      case ClipMode.OmniDirectional:
        return this.clips.omniFrame(visual.symbol, rotationCount, omniIndex(visual.angleRadians ?? 0, rotationCount));
    }
  }

  private overlay(ctx: Context2D, visual: OverlayVisual, context: PaintContext): void {
    const resolution = this.resolution;
    ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
    ctx.globalAlpha = 1;
    if (visual.kind === VisualKind.Line) {
      const from = roundedScreenPoint(visual.from, context.drawOrigin, context.projectionFactor);
      const to = roundedScreenPoint(visual.to, context.drawOrigin, context.projectionFactor);
      ctx.lineCap = 'round';
      ctx.lineWidth = visual.thickness;
      ctx.strokeStyle = cssColor(visual.color, visual.alpha / ALPHA_PERCENT);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      return;
    }
    const { x, y } = visual.topLeftPx;
    const color = cssColor(visual.color, visual.alpha / ALPHA_PERCENT);
    if (visual.solid) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, visual.sizePx, visual.sizePx);
    }
    ctx.lineWidth = SQUARE_LINE_WIDTH_PX;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, visual.sizePx, visual.sizePx);
  }
}
