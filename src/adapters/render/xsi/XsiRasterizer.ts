import { applyGlow, rgbFromNumber } from '../color/pixelFilters.ts';
import { IDENTITY, type Matrix } from '../geometry/Matrix.ts';
import { bufferLayout } from '../clips/bufferLayout.ts';
import { cssColor, readPixels, resetContext, type BufferedBitmap, type Context2D, type Surface, type SurfaceFactory } from '../surface.ts';
import type { SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import { XSI_BUFFER_INFLATE_PX, XSI_OUTLINE_GLOW, XSI_SHADOW_FILTER } from '../tuning.ts';
import { drawingBounds, type ColorFill, type TextureFill, type XsiDrawing, type XsiPlane } from './framePlanes.ts';

const FILL_RULE: CanvasFillRule = 'evenodd';
const LINE_JOIN: CanvasLineJoin = 'round';
const LINE_CAP: CanvasLineCap = 'round';
const TRANSPARENT = 'transparent';

function tracePath(ctx: Context2D, points: readonly number[]): void {
  ctx.moveTo(points[0] ?? 0, points[1] ?? 0);
  for (let index = 2; index + 1 < points.length; index += 2) ctx.lineTo(points[index] as number, points[index + 1] as number);
}

export class XsiTextures {
  private readonly textures = new Map<string, Surface | null>();

  constructor(private readonly renderer: SymbolRenderer) {}

  surface(fill: TextureFill): Surface | undefined {
    const cached = this.textures.get(fill.linkage);
    if (cached !== undefined) return cached ?? undefined;
    const characterId = this.renderer.library.characterId(fill.linkage);
    let surface: Surface | null = null;
    if (characterId !== undefined) {
      surface = this.renderer.createSurface(fill.size.x, fill.size.y);
      this.renderer.draw(surface.ctx, characterId, 0, IDENTITY);
    }
    this.textures.set(fill.linkage, surface);
    return surface ?? undefined;
  }
}

export class XsiRasterizer {
  constructor(
    private readonly surfaces: SurfaceFactory,
    private readonly textures: XsiTextures,
  ) {}

  rasterize(drawing: XsiDrawing): BufferedBitmap {
    const layout = bufferLayout(drawingBounds(drawing), drawing.scale, drawing.scale, XSI_BUFFER_INFLATE_PX);
    const target = this.surfaces.create(layout.width, layout.height);
    this.drawShadow(target, drawing, layout.matrix);
    const { ctx } = target;
    ctx.setTransform(...layout.matrix);
    ctx.lineJoin = LINE_JOIN;
    ctx.lineCap = LINE_CAP;
    for (const plane of drawing.planes) this.drawPlane(ctx, plane, drawing);
    resetContext(ctx);
    const image = readPixels(target);
    if (image) {
      applyGlow(image.data, target.width, target.height, {
        color: rgbFromNumber(XSI_OUTLINE_GLOW.color),
        colorAlpha: 1,
        blurX: XSI_OUTLINE_GLOW.blurX,
        blurY: XSI_OUTLINE_GLOW.blurY,
        strength: XSI_OUTLINE_GLOW.strength,
        passes: XSI_OUTLINE_GLOW.passes,
      });
      ctx.putImageData(image, 0, 0);
    }
    return { surface: target, dispX: layout.dispX, dispY: layout.dispY };
  }

  private drawShadow(target: Surface, drawing: XsiDrawing, matrix: Matrix): void {
    if (drawing.shadows.length === 0) return;
    const shadow = this.surfaces.create(target.width, target.height);
    shadow.ctx.setTransform(...matrix);
    shadow.ctx.fillStyle = cssColor(drawing.shadowFill.color, drawing.shadowFill.alpha);
    for (const polygon of drawing.shadows) {
      shadow.ctx.beginPath();
      tracePath(shadow.ctx, polygon);
      shadow.ctx.fill(FILL_RULE);
    }
    resetContext(shadow.ctx);
    const image = readPixels(shadow);
    if (!image) return;
    applyGlow(image.data, shadow.width, shadow.height, {
      color: rgbFromNumber(XSI_SHADOW_FILTER.color),
      colorAlpha: 1,
      blurX: XSI_SHADOW_FILTER.blurX,
      blurY: XSI_SHADOW_FILTER.blurY,
      strength: XSI_SHADOW_FILTER.strength,
      passes: XSI_SHADOW_FILTER.passes,
      hideObject: true,
    });
    shadow.ctx.putImageData(image, 0, 0);
    target.ctx.drawImage(shadow.canvas, 0, 0);
  }

  private drawPlane(ctx: Context2D, plane: XsiPlane, drawing: XsiDrawing): void {
    const edge = drawing.edgeStyle;
    if (edge.thickness > 0 && plane.edges.length > 0) {
      ctx.lineWidth = edge.thickness;
      ctx.strokeStyle = cssColor(edge.color, edge.alpha);
      for (const line of plane.edges) {
        ctx.beginPath();
        tracePath(ctx, line);
        ctx.stroke();
      }
    }
    for (const polygon of plane.polygons) {
      ctx.beginPath();
      tracePath(ctx, polygon.points);
      ctx.closePath();
      ctx.fillStyle = polygon.fill.kind === 'color' ? this.colorStyle(polygon.fill) : this.textureStyle(ctx, polygon.fill);
      ctx.fill(FILL_RULE);
      if (polygon.shade) {
        ctx.fillStyle = this.colorStyle(polygon.shade);
        ctx.fill(FILL_RULE);
      }
    }
  }

  private colorStyle(fill: ColorFill): string {
    return cssColor(fill.color, fill.alpha);
  }

  private textureStyle(ctx: Context2D, fill: TextureFill): CanvasPattern | string {
    const texture = this.textures.surface(fill);
    const pattern = texture ? ctx.createPattern(texture.canvas, 'repeat') : null;
    if (!pattern) return TRANSPARENT;
    pattern.setTransform(new DOMMatrix([...fill.matrix]));
    return pattern;
  }
}
