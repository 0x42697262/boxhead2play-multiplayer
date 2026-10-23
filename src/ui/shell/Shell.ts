import { SCREEN_HEIGHT_PX, SCREEN_WIDTH_PX } from '../../domain/world/tuning.ts';
import { AppError, ErrorCode } from '../../text/errors.ts';
import { t } from '../../text/i18n.ts';

export const STAGE_WIDTH_PX = SCREEN_WIDTH_PX;
export const STAGE_HEIGHT_PX = SCREEN_HEIGHT_PX;

export const ShellClass = {
  Root: 'shell',
  Canvas: 'shell-canvas',
  Overlay: 'shell-overlay',
  Status: 'shell-status',
  Pixelated: 'shell-pixelated',
} as const;

export interface StageScale {
  readonly scale: number;
  readonly pixelated: boolean;
}

export function stageScale(viewportWidth: number, viewportHeight: number): StageScale {
  const fit = Math.min(viewportWidth / STAGE_WIDTH_PX, viewportHeight / STAGE_HEIGHT_PX);
  if (fit >= 1) return { scale: Math.floor(fit), pixelated: true };
  return { scale: Math.max(fit, Number.EPSILON), pixelated: false };
}

export class Shell {
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

  fit(viewportWidth: number, viewportHeight: number): void {
    const { scale, pixelated } = stageScale(viewportWidth, viewportHeight);
    this.root.style.width = `${STAGE_WIDTH_PX * scale}px`;
    this.root.style.height = `${STAGE_HEIGHT_PX * scale}px`;
    this.canvas.classList.toggle(ShellClass.Pixelated, pixelated);
  }

  showStatus(text: string): void {
    const status = this.overlay.ownerDocument.createElement('p');
    status.className = ShellClass.Status;
    status.textContent = text;
    this.overlay.replaceChildren(status);
    this.overlay.hidden = false;
  }

  showContent(content: HTMLElement): void {
    this.overlay.replaceChildren(content);
    this.overlay.hidden = false;
  }

  hideOverlay(): void {
    this.overlay.replaceChildren();
    this.overlay.hidden = true;
  }

  clearStage(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, STAGE_WIDTH_PX, STAGE_HEIGHT_PX);
  }
}
