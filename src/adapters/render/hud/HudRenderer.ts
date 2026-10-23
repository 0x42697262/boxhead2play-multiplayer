import type { Point2, ScoreAwarded } from '../../../domain/events.ts';
import type { MultiplierListEntry } from '../../../domain/upgrades/Upgrades.ts';
import { OPAQUE_ALPHA } from '../../../domain/visuals.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import { SCREEN_HEIGHT_PX, SCREEN_WIDTH_PX } from '../../../domain/world/tuning.ts';
import { t } from '../../../text/i18n.ts';
import { bufferLayout } from '../clips/bufferLayout.ts';
import { alphaOnly } from '../color/colorTransform.ts';
import { flashTranslate, IDENTITY, type Matrix } from '../geometry/Matrix.ts';
import { transformRect, type Rect } from '../geometry/Rect.ts';
import { resetContext, type BufferedBitmap, type Context2D, type Surface } from '../surface.ts';
import type { Overrides } from '../symbols/SymbolLibrary.ts';
import type { SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import { HUD_BUFFER_INFLATE_PX, HUD_CACHE_LIMIT } from '../tuning.ts';
import { blit } from '../world/VisualPainter.ts';
import type { HudFrame } from '../world/WorldFrame.ts';
import { lifeFrameIndex, MessageTrack, padNumber, ScorePopups, timerFrameIndex, upgradeRows } from './hudAnimation.ts';
import {
  AMMO_LETTER_SPACING_PX,
  FRAG_DIGITS,
  HudChild,
  HudSymbol,
  INACTIVE_UPGRADE_ALPHA,
  LIVE_CLIP_INFLATE_PX,
  MESSAGE_COLORS,
  NEW_WEAPON_UPGRADE_COLOR,
  PAUSE_ROW_SPACING_PX,
  SCORE_DIGITS,
  UPGRADE_COLOR,
  UPGRADE_COLUMNS,
} from './tuning.ts';

export const HudAction = {
  Quit: 'quit',
  SwitchSides: 'switchSides',
} as const;

export type HudAction = (typeof HudAction)[keyof typeof HudAction];

export interface PlayerLabel {
  readonly playerIndex: number;
  readonly screen: Point2;
  readonly lifeRatio: number;
  readonly text: string;
  readonly visible: boolean;
}

const OPAQUE = 1;
const SCORE_TOTAL_POSITION: Point2 = { x: SCREEN_WIDTH_PX / 2, y: 0 };
const MESSAGE_ORIGIN: Point2 = { x: SCREEN_WIDTH_PX / 2, y: SCREEN_HEIGHT_PX };
const FIRST_PLAYER = 0;
const SECOND_PLAYER = 1;

function pointInRect(point: Point2, rect: Rect): boolean {
  return point.x >= rect.xMin && point.x <= rect.xMax && point.y >= rect.yMin && point.y <= rect.yMax;
}

export class HudRenderer {
  private readonly cache = new Map<string, BufferedBitmap>();
  private readonly popups = new ScorePopups();
  private readonly messages = new MessageTrack(MESSAGE_ORIGIN);
  private labels: readonly PlayerLabel[] = [];
  private totals: HudFrame | undefined = undefined;
  private pauseScreen: Surface | undefined = undefined;

  constructor(
    private readonly renderer: SymbolRenderer,
    private readonly gameMode: GameMode,
  ) {}

  get popupCount(): number {
    return this.popups.count;
  }

  addScore(event: ScoreAwarded): void {
    if (this.gameMode === GameMode.DeathMatch) return;
    this.popups.add(event.points, event.screenPosition, SCORE_TOTAL_POSITION);
  }

  drawBitmapLayer(ctx: Context2D, hud: HudFrame, tick: number, ticksPerSecond: number): void {
    for (const { popup, alpha } of this.popups.step()) {
      const text = t('hud.scorePopup', { points: popup.points });
      const bitmap = this.clip(HudSymbol.Score, { [HudChild.PopupText]: { text } }, `score|${text}`, HUD_BUFFER_INFLATE_PX);
      if (bitmap) blit(ctx, bitmap, { x: popup.x, y: popup.y }, 1, alpha);
    }
    this.messages.sync(hud.messages);
    for (const draw of this.messages.step(tick, ticksPerSecond)) {
      const text = t(draw.entry.text.key, draw.entry.text.params ?? {});
      const color = MESSAGE_COLORS[draw.entry.tone];
      const bitmap = this.clip(HudSymbol.Message, { [HudChild.MessageText]: { text, textColor: color } }, `message|${color}|${text}`, HUD_BUFFER_INFLATE_PX);
      if (bitmap) blit(ctx, bitmap, { x: draw.x, y: draw.y }, 1, draw.alpha);
    }
    resetContext(ctx);
    this.totals = hud;
  }

  updatePlayers(labels: readonly PlayerLabel[]): void {
    this.labels = labels;
  }

  showPause(upgrades: readonly MultiplierListEntry[] | undefined): void {
    this.pauseScreen = upgrades ? this.renderPauseScreen(upgrades) : undefined;
  }

  drawLive(ctx: Context2D, viewSide: number): void {
    const totals = this.totals;
    if (totals) {
      if (this.gameMode === GameMode.DeathMatch) this.drawFrags(ctx, totals, viewSide);
      else this.drawScoreTotal(ctx, totals);
    }
    for (const label of this.labels) {
      if (!label.visible) continue;
      const bitmap = this.playerClip(label);
      if (bitmap) blit(ctx, bitmap, label.screen, 1, OPAQUE_ALPHA);
    }
    if (this.pauseScreen) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.pauseScreen.canvas, 0, 0);
    }
    resetContext(ctx);
  }

  hitTest(point: Point2): HudAction | undefined {
    if (this.pauseScreen && this.childButtonContains(HudSymbol.Paused, HudChild.Quit, point)) return HudAction.Quit;
    if (this.gameMode === GameMode.DeathMatch && this.childButtonContains(HudSymbol.PlayerFrags, HudChild.SwitchSides, point)) return HudAction.SwitchSides;
    return undefined;
  }

  private childButtonContains(symbol: string, child: string, point: Point2): boolean {
    const library = this.renderer.library;
    const id = library.characterId(symbol);
    const item = id === undefined ? undefined : library.findChild(id, child);
    const bounds = item ? library.localBounds(item.characterId) : null;
    return bounds !== null && item !== undefined && pointInRect(point, transformRect(bounds, item.matrix));
  }

  private drawScoreTotal(ctx: Context2D, totals: HudFrame): void {
    const timerFrames = this.childFrameCount(HudSymbol.ScoreTotal, HudChild.Timer);
    const overrides: Overrides = {
      [HudChild.ScoreText]: { text: padNumber(totals.totalScore, SCORE_DIGITS) },
      [HudChild.MultiplierText]: { text: t('hud.multiplier', { multiplier: totals.multiplier }) },
      [HudChild.Timer]: { frame: timerFrameIndex(totals.multiplierTickRatio, timerFrames) },
    };
    const key = `total|${totals.totalScore}|${totals.multiplier}|${overrides[HudChild.Timer]?.frame ?? 0}`;
    const bitmap = this.clip(HudSymbol.ScoreTotal, overrides, key, LIVE_CLIP_INFLATE_PX);
    if (bitmap) blit(ctx, bitmap, SCORE_TOTAL_POSITION, 1, OPAQUE_ALPHA);
  }

  private drawFrags(ctx: Context2D, totals: HudFrame, viewSide: number): void {
    const first = viewSide === 0 ? FIRST_PLAYER : SECOND_PLAYER;
    const second = viewSide === 0 ? SECOND_PLAYER : FIRST_PLAYER;
    const panel = (playerIndex: number): Overrides => ({
      [HudChild.PlayerName]: { text: t('hud.playerName', { number: playerIndex + 1 }) },
      [HudChild.Frags]: { text: padNumber(totals.deaths[playerIndex] ?? 0, FRAG_DIGITS) },
    });
    const overrides: Overrides = { [HudChild.Player1]: { children: panel(first) }, [HudChild.Player2]: { children: panel(second) } };
    const key = `frags|${viewSide}|${totals.deaths.join(',')}`;
    const bitmap = this.clip(HudSymbol.PlayerFrags, overrides, key, LIVE_CLIP_INFLATE_PX);
    if (bitmap) blit(ctx, bitmap, { x: 0, y: 0 }, 1, OPAQUE_ALPHA);
  }

  private playerClip(label: PlayerLabel): BufferedBitmap | undefined {
    const lifeFrame = lifeFrameIndex(label.lifeRatio, this.childFrameCount(HudSymbol.Player, HudChild.Life));
    const overrides: Overrides = {
      [HudChild.Life]: { frame: lifeFrame },
      [HudChild.Ammo]: { frame: 0, children: { [HudChild.AmmoText]: { text: label.text, letterSpacing: AMMO_LETTER_SPACING_PX } } },
    };
    return this.clip(HudSymbol.Player, overrides, `player|${lifeFrame}|${label.text}`, LIVE_CLIP_INFLATE_PX);
  }

  private childFrameCount(symbol: string, child: string): number {
    const library = this.renderer.library;
    const id = library.characterId(symbol);
    const item = id === undefined ? undefined : library.findChild(id, child);
    return (item ? library.sprite(item.characterId)?.frameCount : undefined) ?? 1;
  }

  private clip(symbol: string, overrides: Overrides, key: string, inflatePx: number): BufferedBitmap | undefined {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const id = this.renderer.library.characterId(symbol);
    if (id === undefined) return undefined;
    const layout = bufferLayout(this.renderer.library.localBounds(id, 0, overrides), 1, 1, inflatePx);
    const surface = this.renderer.createSurface(layout.width, layout.height);
    this.renderer.draw(surface.ctx, id, 0, layout.matrix, { overrides });
    const bitmap = { surface, dispX: layout.dispX, dispY: layout.dispY };
    if (this.cache.size >= HUD_CACHE_LIMIT) this.cache.clear();
    this.cache.set(key, bitmap);
    return bitmap;
  }

  private renderPauseScreen(upgrades: readonly MultiplierListEntry[]): Surface | undefined {
    const library = this.renderer.library;
    const id = library.characterId(HudSymbol.Paused);
    if (id === undefined) return undefined;
    const surface = this.renderer.createSurface(SCREEN_WIDTH_PX, SCREEN_HEIGHT_PX);
    const hiddenColumns: Overrides = Object.fromEntries(UPGRADE_COLUMNS.map((column) => [column, { visible: false }]));
    this.renderer.draw(surface.ctx, id, 0, IDENTITY, { overrides: hiddenColumns });
    for (const { entry, column, row } of upgradeRows(upgrades)) {
      const template = library.findChild(id, column);
      if (!template) continue;
      const matrix: Matrix = flashTranslate(template.matrix, 0, row * PAUSE_ROW_SPACING_PX);
      const overrides: Overrides = {
        [HudChild.UpgradeText]: { text: t(entry.name), textColor: entry.newWeapon ? NEW_WEAPON_UPGRADE_COLOR : UPGRADE_COLOR },
        [HudChild.UpgradeIndex]: { text: String(entry.index) },
      };
      const alpha = entry.active ? OPAQUE : INACTIVE_UPGRADE_ALPHA;
      this.renderer.draw(surface.ctx, template.characterId, 0, matrix, { overrides, colorTransform: alphaOnly(alpha) });
    }
    return surface;
  }
}
