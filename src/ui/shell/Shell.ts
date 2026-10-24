import { SCREEN_HEIGHT_PX, SCREEN_WIDTH_PX } from '../../domain/world/tuning.ts';
import { AppError, ErrorCode } from '../../text/errors.ts';
import { t } from '../../text/i18n.ts';
import { DEFAULT_GRAPHICS_QUALITY, GraphicsQuality } from '../../services/graphicsQuality.ts';
import { MAX_SHARP_RESOLUTION, MIN_SHARP_RESOLUTION, SHARP_RESOLUTION_STEP, UNIT_RESOLUTION } from './tuning.ts';

export const STAGE_WIDTH_PX = SCREEN_WIDTH_PX;
export const STAGE_HEIGHT_PX = SCREEN_HEIGHT_PX;

export const ShellClass = {
  Root: 'shell',
  Canvas: 'shell-canvas',
  Overlay: 'shell-overlay',
  Status: 'shell-status',
  Pixelated: 'shell-pixelated',
} as const;

export interface StageFit {
  readonly cssScale: number;
  readonly resolution: number;
  readonly pixelated: boolean;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

export function sharpResolution(devicePixelsPerStagePixel: number): number {
  const stepped = Math.ceil(devicePixelsPerStagePixel / SHARP_RESOLUTION_STEP) * SHARP_RESOLUTION_STEP;
  return Math.min(MAX_SHARP_RESOLUTION, Math.max(MIN_SHARP_RESOLUTION, stepped));
}

export function stageFit(viewport: Viewport, quality: GraphicsQuality): StageFit {
  const fit = Math.max(Math.min(viewport.width / STAGE_WIDTH_PX, viewport.height / STAGE_HEIGHT_PX), Number.EPSILON);
  switch (quality) {
    case GraphicsQuality.Sharp:
      return { cssScale: fit, resolution: sharpResolution(fit * viewport.devicePixelRatio), pixelated: false };
    case GraphicsQuality.Smooth:
      return { cssScale: fit, resolution: UNIT_RESOLUTION, pixelated: false };
    case GraphicsQuality.Pixelated:
      return fit >= 1 ? { cssScale: Math.floor(fit), resolution: UNIT_RESOLUTION, pixelated: true } : { cssScale: fit, resolution: UNIT_RESOLUTION, pixelated: false };
  }
}

export function layoutFit(viewport: Viewport, quality: GraphicsQuality, resolution: number): StageFit {
  return { ...stageFit(viewport, quality), resolution };
}

export class Shell {
  private quality: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY;
  private viewport: Viewport = { width: STAGE_WIDTH_PX, height: STAGE_HEIGHT_PX, devicePixelRatio: UNIT_RESOLUTION };
  private fitted: StageFit = { cssScale: UNIT_RESOLUTION, resolution: UNIT_RESOLUTION, pixelated: false };

  private constructor(
    readonly root: HTMLElement,
    readonly canvas: HTMLCanvasElement,
    readonly ctx: CanvasRenderingContext2D,
    readonly overlay: HTMLElement,
  ) {}

  static create(document: Document, host: HTMLElement): Shell {
    document.title = t('app.title');
    const root = document.createElement('div');
    root.className = ShellClass.Root;
    const canvas = document.createElement('canvas');
    canvas.className = ShellClass.Canvas;
    canvas.width = STAGE_WIDTH_PX;
    canvas.height = STAGE_HEIGHT_PX;
    const overlay = document.createElement('div');
    overlay.className = ShellClass.Overlay;
    root.append(canvas, overlay);
    host.replaceChildren(root);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AppError(ErrorCode.CanvasUnavailable, 'canvas 2d');
    return new Shell(root, canvas, ctx, overlay);
  }

  get resolution(): number {
    return this.fitted.resolution;
  }

  get graphicsQuality(): GraphicsQuality {
    return this.quality;
  }

  fit(viewport: Viewport): void {
    this.viewport = viewport;
    this.refit();
  }

  layout(viewport: Viewport): void {
    this.viewport = viewport;
    this.fitted = layoutFit(viewport, this.quality, this.fitted.resolution);
    this.apply();
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.refit();
  }

  private refit(): void {
    this.fitted = stageFit(this.viewport, this.quality);
    this.apply();
  }

  private apply(): void {
    const { cssScale, resolution, pixelated } = this.fitted;
    this.root.style.width = `${STAGE_WIDTH_PX * cssScale}px`;
    this.root.style.height = `${STAGE_HEIGHT_PX * cssScale}px`;
    const width = Math.round(STAGE_WIDTH_PX * resolution);
    const height = Math.round(STAGE_HEIGHT_PX * resolution);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.canvas.classList.toggle(ShellClass.Pixelated, pixelated);
  }

  private failed = false;

  showError(text: string): void {
    this.showStatus(text);
    this.failed = true;
  }

  showStatus(text: string): void {
    if (this.failed) return;
    const status = this.overlay.ownerDocument.createElement('p');
    status.className = ShellClass.Status;
    status.textContent = text;
    this.overlay.replaceChildren(status);
    this.overlay.hidden = false;
  }

  hideOverlay(): void {
    this.overlay.replaceChildren();
    this.overlay.hidden = true;
  }

  setCursor(cursor: string): void {
    this.canvas.style.cursor = cursor;
  }
}
