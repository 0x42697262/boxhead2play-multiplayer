import type { DecalRequested, Point2, ScoreAwarded } from '../../../domain/events.ts';
import type { MultiplierListEntry } from '../../../domain/upgrades/Upgrades.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import { SCREEN_HEIGHT_PX, SCREEN_WIDTH_PX, SPLIT_SCREEN_SIZE_PX } from '../../../domain/world/tuning.ts';
import { t } from '../../../text/i18n.ts';
import type { Room } from '../../assets/schemas.ts';
import type { ClipBuffers } from '../clips/ClipBuffers.ts';
import { transformPoint } from '../geometry/Matrix.ts';
import type { HudRenderer, PlayerLabel } from '../hud/HudRenderer.ts';
import { cssColor, resetContext, type Context2D, type Surface } from '../surface.ts';
import type { SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import { CHANNEL_MAX } from '../tuning.ts';
import { floorSourceOrigin, roundedScreenPoint, splitScreenLayout, splitScreenMatrix, viewSideFor } from './projection.ts';
import { buildRoomPlanes, stampDecal, type RoomPlanes } from './RoomPlanes.ts';
import type { VisualPainter } from './VisualPainter.ts';
import type { CameraFrame, PlayerHudFrame, WorldFrame } from './WorldFrame.ts';

export const BACKGROUND_COLOR = 0x000000;

export interface WorldRendererOptions {
  readonly gameMode: GameMode;
  readonly detail: boolean;
  readonly viewSide: () => number;
}

export function playerLabelText(player: PlayerHudFrame): string {
  const weapon = t(player.status.weaponShortName);
  return player.status.ammo === undefined ? weapon : t('hud.ammo', { weapon, ammo: player.status.ammo });
}

export function copyClipped(ctx: Context2D, source: Surface, sourceX: number, sourceY: number, width: number, height: number): void {
  const left = Math.max(0, sourceX);
  const top = Math.max(0, sourceY);
  const right = Math.min(source.width, sourceX + width);
  const bottom = Math.min(source.height, sourceY + height);
  if (right <= left || bottom <= top) return;
  ctx.drawImage(source.canvas, left, top, right - left, bottom - top, left - sourceX, top - sourceY, right - left, bottom - top);
}

export class WorldRenderer {
  readonly screen: Surface;
  private readonly split: Surface | undefined;
  private readonly planes: RoomPlanes;
  private readonly layout = splitScreenLayout();
  private lastDrawOrigin: Point2 | undefined = undefined;

  constructor(
    room: Room,
    private readonly renderer: SymbolRenderer,
    private readonly clips: ClipBuffers,
    private readonly painter: VisualPainter,
    readonly hud: HudRenderer,
    private readonly options: WorldRendererOptions,
  ) {
    this.planes = buildRoomPlanes(room, renderer);
    this.screen = renderer.createSurface(SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX);
    this.split = options.gameMode === GameMode.DeathMatch ? renderer.createSurface(SPLIT_SCREEN_SIZE_PX, SPLIT_SCREEN_SIZE_PX) : undefined;
  }

  get floor(): Surface {
    return this.planes.floor;
  }

  stampDecal(decal: DecalRequested): void {
    stampDecal(this.planes, this.clips, this.renderer, decal);
  }

  awardScore(event: ScoreAwarded): void {
    this.hud.addScore(event);
  }

  showPause(upgrades: readonly MultiplierListEntry[] | undefined): void {
    this.hud.showPause(upgrades);
  }

  render(frame: WorldFrame): void {
    if (frame.paused) return;
    const labels = this.split ? this.renderSplit(this.split, frame) : this.renderSingle(frame);
    this.hud.updatePlayers(labels);
    this.applyBrightness(frame.brightness);
    this.hud.drawBitmapLayer(this.screen.ctx, frame.hud, frame.tick, frame.ticksPerSecond);
  }

  composite(target: Context2D): void {
    resetContext(target);
    target.drawImage(this.screen.canvas, 0, 0);
    this.hud.drawLive(target, this.options.viewSide());
  }

  private renderSingle(frame: WorldFrame): PlayerLabel[] {
    const camera = frame.cameras[0];
    if (!camera) return [];
    const labelOrigin = this.lastDrawOrigin ?? camera.view.drawOrigin;
    const labels = frame.hud.players.map((player) => this.label(player, roundedScreenPoint(player.position, labelOrigin, frame.projectionFactor)));
    this.drawPlane(this.screen, camera, frame.projectionFactor);
    this.lastDrawOrigin = camera.view.drawOrigin;
    return labels;
  }

  private renderSplit(split: Surface, frame: WorldFrame): PlayerLabel[] {
    const ctx = this.screen.ctx;
    resetContext(ctx);
    ctx.fillStyle = cssColor(BACKGROUND_COLOR);
    ctx.fillRect(0, 0, this.screen.width, this.screen.height);
    const labels: PlayerLabel[] = [];
    frame.cameras.forEach((camera, index) => {
      this.drawPlane(split, camera, frame.projectionFactor);
      const matrix = splitScreenMatrix(this.layout, viewSideFor(index, this.options.viewSide()));
      const player = frame.hud.players.find((candidate) => candidate.playerIndex === camera.view.playerIndex);
      if (player) {
        const local = roundedScreenPoint(player.position, camera.view.drawOrigin, frame.projectionFactor);
        labels.push(this.label(player, transformPoint(matrix, local.x, local.y)));
      }
      ctx.setTransform(...matrix);
      ctx.imageSmoothingEnabled = this.options.detail;
      ctx.drawImage(split.canvas, 0, 0);
    });
    resetContext(ctx);
    ctx.imageSmoothingEnabled = true;
    return labels;
  }

  private label(player: PlayerHudFrame, screen: Point2): PlayerLabel {
    return { playerIndex: player.playerIndex, screen, lifeRatio: player.status.lifeRatio, text: playerLabelText(player), visible: player.status.visible };
  }

  private drawPlane(target: Surface, camera: CameraFrame, projectionFactor: number): void {
    const ctx = target.ctx;
    resetContext(ctx);
    ctx.fillStyle = cssColor(BACKGROUND_COLOR);
    ctx.fillRect(0, 0, target.width, target.height);
    const source = floorSourceOrigin(camera.view.drawOrigin);
    copyClipped(ctx, this.planes.floor, source.x, source.y, target.width, target.height);
    this.painter.paint(ctx, camera.entries, { drawOrigin: camera.view.drawOrigin, projectionFactor });
    copyClipped(ctx, this.planes.cover, source.x, source.y, target.width, target.height);
  }

  private applyBrightness(brightness: number): void {
    if (!this.options.detail || brightness <= 0) return;
    const ctx = this.screen.ctx;
    const level = Math.round(Math.min(brightness, 1) * CHANNEL_MAX);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgb(${level}, ${level}, ${level})`;
    ctx.fillRect(0, 0, this.screen.width, this.screen.height);
    resetContext(ctx);
  }
}
