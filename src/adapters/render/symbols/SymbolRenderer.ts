import type { GraphicSource } from '../../assets/GraphicImages.ts';
import type { ColorTransform, DisplayItem, EditText, Graphic } from '../../assets/schemas.ts';
import { alphaOnly, applyColorTransform, concatColor, IDENTITY_COLOR, splitAlpha } from '../color/colorTransform.ts';
import { applyEffects, effectPadding, pixelEffects } from '../color/filters.ts';
import { multiply, translation, type Matrix } from '../geometry/Matrix.ts';
import { inflate, transformRect, union, type Rect } from '../geometry/Rect.ts';
import { readPixels, resetContext, type Context2D, type Surface, type SurfaceFactory } from '../surface.ts';
import { BYTE_MASK, CHANNEL_MAX, GREEN_SHIFT, RED_SHIFT } from '../tuning.ts';
import { drawEditText, editTextColor, plainText, type TextStyle } from './editText.ts';
import { BUTTON_UP, childOverride, withReplacements, type ChildOverride, type Overrides, type SymbolLibrary } from './SymbolLibrary.ts';

export interface DrawOptions {
  readonly colorTransform?: ColorTransform;
  readonly overrides?: Overrides;
  readonly hidden?: ReadonlySet<number>;
  readonly ratio?: number;
}

interface DrawState {
  readonly ct: ColorTransform;
  readonly hidden: ReadonlySet<number>;
}

type LayerPainter = (target: Context2D, toLayer: Matrix) => void;

const NO_HIDDEN: ReadonlySet<number> = new Set();

function clampAlpha(alpha: number): number {
  return Math.min(1, Math.max(0, alpha));
}

function transformColor(color: number, ct: ColorTransform): number {
  const channel = (value: number, mult: number, add: number): number => Math.min(CHANNEL_MAX, Math.max(0, Math.round(value * mult + add)));
  const r = channel((color >> RED_SHIFT) & BYTE_MASK, ct.rMult, ct.rAdd);
  const g = channel((color >> GREEN_SHIFT) & BYTE_MASK, ct.gMult, ct.gAdd);
  const b = channel(color & BYTE_MASK, ct.bMult, ct.bAdd);
  return (r << RED_SHIFT) | (g << GREEN_SHIFT) | b;
}

function clipped(ctx: Context2D, matrix: Matrix, clip: Rect, paint: () => void): void {
  ctx.save();
  ctx.setTransform(...matrix);
  ctx.beginPath();
  ctx.rect(clip.xMin, clip.yMin, clip.xMax - clip.xMin, clip.yMax - clip.yMin);
  ctx.clip();
  paint();
  ctx.restore();
}

export class SymbolRenderer {
  constructor(
    readonly library: SymbolLibrary,
    private readonly graphics: GraphicSource,
    private readonly surfaces: SurfaceFactory,
    private readonly textStyle: TextStyle,
  ) {}

  draw(ctx: Context2D, characterId: number, frame: number, matrix: Matrix, options: DrawOptions = {}): void {
    const state = { ct: options.colorTransform ?? IDENTITY_COLOR, hidden: options.hidden ?? NO_HIDDEN };
    this.character(ctx, characterId, frame, matrix, state, options.overrides, options.ratio ?? 0, undefined);
    resetContext(ctx);
  }

  drawItems(ctx: Context2D, items: readonly DisplayItem[], matrix: Matrix, options: DrawOptions = {}): void {
    const state = { ct: options.colorTransform ?? IDENTITY_COLOR, hidden: options.hidden ?? NO_HIDDEN };
    this.itemList(ctx, withReplacements(items, options.overrides), matrix, state, options.overrides);
    resetContext(ctx);
  }

  createSurface(width: number, height: number): Surface {
    return this.surfaces.create(width, height);
  }

  private character(
    ctx: Context2D,
    characterId: number,
    frame: number,
    matrix: Matrix,
    state: DrawState,
    overrides: Overrides | undefined,
    ratio: number,
    own: ChildOverride | undefined,
  ): void {
    const character = this.library.character(characterId);
    if (!character) return;
    switch (character.kind) {
      case 'graphic':
        this.graphic(ctx, character.graphic, matrix, state.ct);
        return;
      case 'morph': {
        const graphic = this.library.morphGraphic(character.ratios, ratio);
        if (graphic) this.graphic(ctx, graphic, matrix, state.ct);
        return;
      }
      case 'editText':
        this.editText(ctx, character.editText, matrix, state.ct, own);
        return;
      case 'button': {
        const buttonState = own?.buttonState ?? BUTTON_UP;
        for (const record of character.button.records) {
          if (!record.states.includes(buttonState)) continue;
          const ct = record.colorTransform ? concatColor(state.ct, record.colorTransform) : state.ct;
          this.character(ctx, record.characterId, 0, multiply(matrix, record.matrix), { ...state, ct }, undefined, 0, undefined);
        }
        return;
      }
      case 'sprite':
        if (character.sprite.selfHidden) return;
        this.itemList(ctx, this.library.composedItems(characterId, frame, own ?? (overrides ? { children: overrides } : undefined)), matrix, state, overrides);
        return;
    }
  }

  private itemList(ctx: Context2D, items: readonly DisplayItem[], matrix: Matrix, state: DrawState, overrides: Overrides | undefined): void {
    let index = 0;
    while (index < items.length) {
      const item = items[index] as DisplayItem;
      if (item.clipDepth === undefined) {
        this.item(ctx, item, matrix, state, overrides);
        index++;
        continue;
      }
      let end = index + 1;
      while (end < items.length && (items[end] as DisplayItem).depth <= item.clipDepth) end++;
      this.masked(ctx, item, items.slice(index + 1, end), matrix, state, overrides);
      index = end;
    }
  }

  private itemBounds(item: DisplayItem, parent: Matrix, overrides: Overrides | undefined): Rect | null {
    const own = childOverride(overrides, item);
    const local = this.library.instanceBounds(item.characterId, own, item.ratio ?? 0);
    return local ? transformRect(local, multiply(parent, own?.matrix ?? item.matrix)) : null;
  }

  private item(ctx: Context2D, item: DisplayItem, parent: Matrix, state: DrawState, overrides: Overrides | undefined): void {
    if (state.hidden.has(item.characterId)) return;
    const own = childOverride(overrides, item);
    if ((own?.visible ?? item.visible ?? true) === false) return;
    const matrix = multiply(parent, own?.matrix ?? item.matrix);
    let ct = item.colorTransform ? concatColor(state.ct, item.colorTransform) : state.ct;
    if (own?.alpha !== undefined) ct = concatColor(ct, alphaOnly(own.alpha));
    const childState = { ...state, ct };
    const draw = (target: Context2D, m: Matrix): void =>
      this.character(target, item.characterId, own?.frame ?? 0, m, childState, own?.children, item.ratio ?? 0, own);
    const clip = own?.clip;
    const paint = clip === undefined ? draw : (target: Context2D, m: Matrix): void => clipped(target, m, clip, () => draw(target, m));
    const effects = pixelEffects(own?.filters ?? item.filters);
    if (effects.length === 0) {
      paint(ctx, matrix);
      return;
    }
    const bounds = this.itemBounds(item, parent, overrides);
    if (!bounds) return;
    this.layer(ctx, inflate(bounds, effectPadding(effects), effectPadding(effects)), (target, toLayer) => paint(target, multiply(toLayer, matrix)), (surface) => {
      const image = readPixels(surface);
      if (!image) return;
      applyEffects(image.data, surface.width, surface.height, effects);
      surface.ctx.putImageData(image, 0, 0);
    });
  }

  private masked(ctx: Context2D, mask: DisplayItem, contents: readonly DisplayItem[], parent: Matrix, state: DrawState, overrides: Overrides | undefined): void {
    let bounds: Rect | null = null;
    for (const item of contents) bounds = union(bounds, this.itemBounds(item, parent, overrides));
    if (!bounds) return;
    this.layer(
      ctx,
      bounds,
      (target, toLayer) => {
        const shifted = multiply(toLayer, parent);
        for (const item of contents) this.item(target, item, shifted, state, overrides);
      },
      (surface, toLayer) => {
        const maskSurface = this.surfaces.create(surface.width, surface.height);
        this.item(maskSurface.ctx, mask, multiply(toLayer, parent), { ...state, ct: IDENTITY_COLOR }, overrides);
        resetContext(maskSurface.ctx);
        surface.ctx.globalCompositeOperation = 'destination-in';
        surface.ctx.drawImage(maskSurface.canvas, 0, 0);
        surface.ctx.globalCompositeOperation = 'source-over';
      },
    );
  }

  private layer(ctx: Context2D, deviceBounds: Rect, paint: LayerPainter, finish: (surface: Surface, toLayer: Matrix) => void): void {
    const xMin = Math.max(0, Math.floor(deviceBounds.xMin));
    const yMin = Math.max(0, Math.floor(deviceBounds.yMin));
    const xMax = Math.min(ctx.canvas.width, Math.ceil(deviceBounds.xMax));
    const yMax = Math.min(ctx.canvas.height, Math.ceil(deviceBounds.yMax));
    if (xMax <= xMin || yMax <= yMin) return;
    const surface = this.surfaces.create(xMax - xMin, yMax - yMin);
    const toLayer = translation(-xMin, -yMin);
    paint(surface.ctx, toLayer);
    resetContext(surface.ctx);
    finish(surface, toLayer);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(surface.canvas, xMin, yMin);
  }

  private graphic(ctx: Context2D, graphic: Graphic, matrix: Matrix, ct: ColorTransform): void {
    const image = this.graphics.image(graphic.svg);
    if (!image) return;
    const { xMin, yMin, xMax, yMax } = graphic.bounds;
    const { alpha, color } = splitAlpha(ct);
    if (!color) {
      ctx.setTransform(...matrix);
      ctx.globalAlpha = clampAlpha(alpha);
      ctx.drawImage(image, xMin, yMin, xMax - xMin, yMax - yMin);
      return;
    }
    this.layer(
      ctx,
      transformRect(graphic.bounds, matrix),
      (target, toLayer) => {
        target.setTransform(...multiply(toLayer, matrix));
        target.drawImage(image, xMin, yMin, xMax - xMin, yMax - yMin);
      },
      (surface) => {
        const image = readPixels(surface);
        if (!image) return;
        applyColorTransform(image.data, color);
        surface.ctx.putImageData(image, 0, 0);
      },
    );
  }

  private editText(ctx: Context2D, editText: EditText, matrix: Matrix, ct: ColorTransform, own: ChildOverride | undefined): void {
    const color = transformColor(own?.textColor ?? editTextColor(editText), ct);
    const run = { text: own?.text ?? plainText(editText), color, ...(own?.letterSpacing === undefined ? {} : { letterSpacing: own.letterSpacing }) };
    drawEditText(ctx, editText, matrix, run, clampAlpha(ct.aMult), this.textStyle);
  }
}
