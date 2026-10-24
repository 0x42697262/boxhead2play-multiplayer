import { DecalKind, type DecalRequested, type Point2, type ScoreAwarded } from '../../../domain/events.ts';
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
import { buildRoomPlanes, DecalStamper, type RoomPlanes } from './RoomPlanes.ts';
import type { VisualPainter } from './VisualPainter.ts';
import type { CameraFrame, PlayerHudFrame, WorldFrame } from './WorldFrame.ts';

export const BACKGROUND_COLOR = 0x000000;

export interface EffectPreferences {
  readonly screenShake: boolean;
  readonly blood: boolean;
}

export const ALL_EFFECTS: EffectPreferences = { screenShake: true, blood: true };

export interface WorldRendererOptions {
  readonly detail: boolean;
  readonly resolution: () => number;
  readonly effects?: () => EffectPreferences;
}

export function viewOrigin(camera: CameraFrame, effects: EffectPreferences): Point2 {
  return effects.screenShake ? camera.view.drawOrigin : { x: camera.view.rect.x, y: camera.view.rect.y };
}

export function decalShown(decal: DecalRequested, effects: EffectPreferences): boolean {
  return effects.blood || decal.decal !== DecalKind.BloodSplat;
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
  private screenSurface: Surface;
  private composed: Surface;
  private planes: RoomPlanes;
  private currentResolution: number;
  private readonly decals: DecalRequested[] = [];
  private lastDrawOrigin: CameraFrame['view']['drawOrigin'] | undefined = undefined;
  private bloodShown: boolean;
  private readonly stamper: DecalStamper;

  constructor(
    private readonly room: Room,
    private readonly renderer: SymbolRenderer,
    private readonly clips: ClipBuffers,
    private readonly painter: VisualPainter,
    readonly hud: HudRenderer,
    private readonly options: WorldRendererOptions,
  ) {
    this.currentResolution = options.resolution();
    this.bloodShown = this.effects.blood;
    this.stamper = new DecalStamper(renderer);
    this.applyResolution();
    this.planes = buildRoomPlanes(room, renderer, this.currentResolution);
    this.screenSurface = this.screenSized();
    this.composed = this.screenSized();
  }

  get screen(): Surface {
    return this.screenSurface;
  }

  get floor(): Surface {
    return this.planes.floor;
  }

  get resolution(): number {
    return this.currentResolution;
  }

  stampDecal(decal: DecalRequested): void {
    this.decals.push(decal);
    if (decalShown(decal, this.effects)) this.stamper.stamp(this.planes, this.clips, decal);
  }

  awardScore(event: ScoreAwarded): void {
    this.hud.addScore(event);
  }

  showUpgrades(upgrades: readonly MultiplierListEntry[] | undefined): void {
    this.hud.showUpgrades(upgrades);
  }

  render(frame: WorldFrame): void {
    this.syncResolution();
    this.syncBlood();
    this.hud.updatePlayers(this.renderCamera(frame));
    this.applyBrightness(frame.brightness);
    this.hud.drawBitmapLayer(this.screen.ctx, frame.hud, frame.tick, frame.ticksPerSecond);
  }

  composite(): Surface {
    const target = this.composed.ctx;
    resetContext(target);
    target.drawImage(this.screen.canvas, 0, 0);
    this.hud.drawLive(target);
    return this.composed;
  }

  private syncResolution(): void {
    const resolution = this.options.resolution();
    if (resolution === this.currentResolution) return;
    this.currentResolution = resolution;
    this.applyResolution();
    this.rebuildPlanes();
    this.screenSurface = this.screenSized();
    this.composed = this.screenSized();
  }

  private get effects(): EffectPreferences {
    return this.options.effects?.() ?? ALL_EFFECTS;
  }

  private syncBlood(): void {
    const { blood } = this.effects;
    if (blood === this.bloodShown) return;
    this.bloodShown = blood;
    this.rebuildPlanes();
  }

  private rebuildPlanes(): void {
    this.planes = buildRoomPlanes(this.room, this.renderer, this.currentResolution);
    const effects = this.effects;
    for (const decal of this.decals) if (decalShown(decal, effects)) this.stamper.stamp(this.planes, this.clips, decal);
  }

  private applyResolution(): void {
    this.painter.setResolution(this.currentResolution);
    this.hud.setResolution(this.currentResolution);
  }

  private screenSized(): Surface {
    return this.renderer.createSurface(SCREEN_WIDTH_PX * this.currentResolution, SCREEN_HEIGHT_PX * this.currentResolution);
  }

  private renderCamera(frame: WorldFrame): PlayerLabel[] {
    const camera = localCamera(frame);
    if (!camera) return [];
    const origin = viewOrigin(camera, this.effects);
    const labelOrigin = this.lastDrawOrigin ?? origin;
    const labels = frame.hud.players.map((player) => this.label(frame, player, roundedScreenPoint(player.position, labelOrigin, frame.projectionFactor)));
    this.drawPlane(this.screen, camera, origin, frame.projectionFactor);
    this.lastDrawOrigin = origin;
    return labels;
  }

  private label(frame: WorldFrame, player: PlayerHudFrame, screen: PlayerLabel['screen']): PlayerLabel {
    return {
      playerIndex: player.playerIndex,
      screen,
      lifeRatio: player.status.lifeRatio,
      text: playerLabelText(player),
      visible: player.status.visible,
      name: frame.hud.playerNames[player.playerIndex] ?? '',
      local: player.playerIndex === frame.hud.localPlayerIndex,
    };
  }

  private drawPlane(target: Surface, camera: CameraFrame, origin: Point2, projectionFactor: number): void {
    const ctx = target.ctx;
    resetContext(ctx);
    ctx.fillStyle = cssColor(BACKGROUND_COLOR);
    ctx.fillRect(0, 0, target.width, target.height);
    const source = floorSourceOrigin(origin, this.currentResolution);
    copyClipped(ctx, this.planes.floor, source.x, source.y, target.width, target.height);
    this.painter.paint(ctx, camera.entries, { drawOrigin: origin, projectionFactor });
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
