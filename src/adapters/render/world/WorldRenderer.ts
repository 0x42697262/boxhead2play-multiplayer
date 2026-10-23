import type { DecalRequested, ScoreAwarded } from '../../../domain/events.ts';
import type { MultiplierListEntry } from '../../../domain/upgrades/Upgrades.ts';
import { SCREEN_HEIGHT_PX, SCREEN_WIDTH_PX } from '../../../domain/world/tuning.ts';
import { t } from '../../../text/i18n.ts';
import type { Room } from '../../assets/schemas.ts';
import type { ClipBuffers } from '../clips/ClipBuffers.ts';
import type { HudRenderer, PlayerLabel } from '../hud/HudRenderer.ts';
import { cssColor, resetContext, type Context2D, type Surface } from '../surface.ts';
import type { SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import { CHANNEL_MAX } from '../tuning.ts';
import { floorSourceOrigin, roundedScreenPoint } from './projection.ts';
import { buildRoomPlanes, stampDecal, type RoomPlanes } from './RoomPlanes.ts';
import type { VisualPainter } from './VisualPainter.ts';
import type { CameraFrame, PlayerHudFrame, WorldFrame } from './WorldFrame.ts';

export const BACKGROUND_COLOR = 0x000000;

export interface WorldRendererOptions {
  readonly detail: boolean;
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

export function localCamera(frame: WorldFrame): CameraFrame | undefined {
  return frame.cameras.find((camera) => camera.view.playerIndex === frame.localPlayerIndex) ?? frame.cameras[0];
}

export class WorldRenderer {
  readonly screen: Surface;
  private readonly planes: RoomPlanes;
  private lastDrawOrigin: CameraFrame['view']['drawOrigin'] | undefined = undefined;

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

  showUpgrades(upgrades: readonly MultiplierListEntry[] | undefined): void {
    this.hud.showUpgrades(upgrades);
  }

  render(frame: WorldFrame): void {
    this.hud.updatePlayers(this.renderCamera(frame));
    this.applyBrightness(frame.brightness);
    this.hud.drawBitmapLayer(this.screen.ctx, frame.hud, frame.tick, frame.ticksPerSecond);
  }

  composite(target: Context2D): void {
    resetContext(target);
    target.drawImage(this.screen.canvas, 0, 0);
    this.hud.drawLive(target);
  }

  private renderCamera(frame: WorldFrame): PlayerLabel[] {
    const camera = localCamera(frame);
    if (!camera) return [];
    const labelOrigin = this.lastDrawOrigin ?? camera.view.drawOrigin;
    const labels = frame.hud.players.map((player) => this.label(player, roundedScreenPoint(player.position, labelOrigin, frame.projectionFactor)));
    this.drawPlane(this.screen, camera, frame.projectionFactor);
    this.lastDrawOrigin = camera.view.drawOrigin;
    return labels;
  }

  private label(player: PlayerHudFrame, screen: PlayerLabel['screen']): PlayerLabel {
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
