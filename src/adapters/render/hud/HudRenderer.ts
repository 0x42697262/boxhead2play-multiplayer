import type { Point2, ScoreAwarded } from '../../../domain/events.ts';
import type { MultiplierListEntry } from '../../../domain/upgrades/Upgrades.ts';
import { OPAQUE_ALPHA } from '../../../domain/visuals.ts';
import { GameMode } from '../../../domain/world/GameMode.ts';
import { SCREEN_HEIGHT_PX, SCREEN_WIDTH_PX } from '../../../domain/world/tuning.ts';
import { t } from '../../../text/i18n.ts';
import type { DisplayItem } from '../../assets/schemas.ts';
import { bufferLayout } from '../clips/bufferLayout.ts';
import { alphaOnly } from '../color/colorTransform.ts';
import { flashTranslate, multiply, scaling, type Matrix } from '../geometry/Matrix.ts';
import { transformRect, type Rect } from '../geometry/Rect.ts';
import { resetContext, type BufferedBitmap, type Context2D, type Surface } from '../surface.ts';
import { depthKey, type Overrides } from '../symbols/SymbolLibrary.ts';
import type { SymbolRenderer } from '../symbols/SymbolRenderer.ts';
import { LruCache } from '../lruCache.ts';
import { HUD_BUFFER_INFLATE_PX, HUD_CACHE_LIMIT } from '../tuning.ts';
import { blit } from '../world/VisualPainter.ts';
import type { HudFrame } from '../world/WorldFrame.ts';
import { scoreboardRows, type ScoreboardRow } from './scoreboard.ts';
import { lifeFrameIndex, MessageTrack, padNumber, ScorePopups, timerFrameIndex, upgradeRows } from './hudAnimation.ts';
import {
  AMMO_LETTER_SPACING_PX,
  HudChild,
  HudSymbol,
  INACTIVE_UPGRADE_ALPHA,
  LIVE_CLIP_INFLATE_PX,
  LOCAL_PLAYER_NAME_COLOR,
  OTHER_PLAYER_NAME_COLOR,
  PLAYER_NAME_BOX_WIDTH_PX,
  PLAYER_NAME_CHILD,
  PLAYER_NAME_FONT_PX,
  PLAYER_NAME_OFFSET_Y_PX,
  MESSAGE_COLORS,
  NEW_WEAPON_UPGRADE_COLOR,
  PAUSED_TITLE_DEPTH,
  RESPAWN_TEXT_COLOR,
  RESPAWN_TEXT_POSITION,
  RESPAWN_TEXT_SCALE,
  SCOREBOARD_COLUMNS,
  SCOREBOARD_TITLE_POSITION,
  UPGRADE_LIST_TITLE_DEPTH,
  UPGRADE_ROW_SPACING_PX,
  SCORE_DIGITS,
  UPGRADE_COLOR,
  UPGRADE_COLUMNS,
  PING_BOX_WIDTH_PX,
  PING_COLORS,
  PING_FONT_PX,
  PING_POSITION,
  PING_SLOW_COLOR,
} from './tuning.ts';

export const HudAction = {
  Quit: 'quit',
} as const;

export type HudAction = (typeof HudAction)[keyof typeof HudAction];

interface TextClipLook {
  readonly text: string;
  readonly color: number;
  readonly fontPx: number;
  readonly boxWidthPx: number;
  readonly rightAligned: boolean;
}

const RIGHT = 'right';

export function pingColor(latencyMs: number): number {
  return PING_COLORS.find((band) => latencyMs <= band.maxMs)?.color ?? PING_SLOW_COLOR;
}

export interface PlayerLabel {
  readonly playerIndex: number;
  readonly screen: Point2;
  readonly lifeRatio: number;
  readonly text: string;
  readonly visible: boolean;
  readonly name: string;
  readonly local: boolean;
}

const OPAQUE = 1;
const SCORE_TOTAL_POSITION: Point2 = { x: SCREEN_WIDTH_PX / 2, y: 0 };
const MESSAGE_ORIGIN: Point2 = { x: SCREEN_WIDTH_PX / 2, y: SCREEN_HEIGHT_PX };

export function playerDisplayName(hud: HudFrame, playerIndex: number): string {
  const name = hud.playerNames[playerIndex];
  return name ? name : t('hud.playerName');
}

export function respawnSeconds(ticks: number, ticksPerSecond: number): number {
  return Math.max(1, Math.ceil(ticks / ticksPerSecond));
}

export function namedParams(hud: HudFrame, names: Readonly<Record<string, number>> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(names ?? {}).map(([param, playerIndex]) => [param, playerDisplayName(hud, playerIndex)]));
}

function pointInRect(point: Point2, rect: Rect): boolean {
  return point.x >= rect.xMin && point.x <= rect.xMax && point.y >= rect.yMin && point.y <= rect.yMax;
}

export class HudRenderer {
  private readonly cache = new LruCache<BufferedBitmap>(HUD_CACHE_LIMIT);
  private readonly popups = new ScorePopups();
  private readonly messages = new MessageTrack(MESSAGE_ORIGIN);
  private labels: readonly PlayerLabel[] = [];
  private totals: HudFrame | undefined = undefined;
  private upgradeList: Surface | undefined = undefined;
  private upgradeListKey: string | undefined = undefined;
  private upgradeEntries: readonly MultiplierListEntry[] | undefined = undefined;
  private panelShown = false;
  private ticksPerSecond = 1;
  private scoreboard: { readonly key: string; readonly surface: Surface | undefined } | undefined = undefined;
  private currentResolution = 1;

  constructor(
    private readonly renderer: SymbolRenderer,
    private readonly gameMode: GameMode,
  ) {}

  get popupCount(): number {
    return this.popups.count;
  }

  get resolution(): number {
    return this.currentResolution;
  }

  setResolution(resolution: number): void {
    if (resolution === this.currentResolution) return;
    this.currentResolution = resolution;
    this.cache.clear();
    this.upgradeList = this.upgradeEntries ? this.renderUpgradeList(this.upgradeEntries) : undefined;
    this.scoreboard = undefined;
  }

  addScore(event: ScoreAwarded): void {
    if (this.gameMode === GameMode.DeathMatch) return;
    this.popups.add(event.points, event.screenPosition, SCORE_TOTAL_POSITION);
  }

  drawBitmapLayer(ctx: Context2D, hud: HudFrame, tick: number, ticksPerSecond: number): void {
    for (const { popup, alpha } of this.popups.step()) {
      const text = t('hud.scorePopup', { points: popup.points });
      const bitmap = this.clip(HudSymbol.Score, { [HudChild.PopupText]: { text } }, `score|${text}`, HUD_BUFFER_INFLATE_PX);
      if (bitmap) blit(ctx, bitmap, { x: popup.x, y: popup.y }, 1, alpha, this.currentResolution);
    }
    this.messages.sync(hud.messages);
    for (const draw of this.messages.step(tick, ticksPerSecond)) {
      const text = t(draw.entry.text.key, { ...draw.entry.text.params, ...namedParams(hud, draw.entry.names) });
      const color = MESSAGE_COLORS[draw.entry.tone];
      const bitmap = this.clip(HudSymbol.Message, { [HudChild.MessageText]: { text, textColor: color } }, `message|${color}|${text}`, HUD_BUFFER_INFLATE_PX);
      if (bitmap) blit(ctx, bitmap, { x: draw.x, y: draw.y }, 1, draw.alpha, this.currentResolution);
    }
    resetContext(ctx);
    this.totals = hud;
    this.ticksPerSecond = ticksPerSecond;
  }

  updatePlayers(labels: readonly PlayerLabel[]): void {
    this.labels = labels;
  }

  showUpgrades(upgrades: readonly MultiplierListEntry[] | undefined): void {
    this.panelShown = upgrades !== undefined;
    if (this.gameMode === GameMode.DeathMatch) return;
    const key = upgrades ? JSON.stringify(upgrades) : undefined;
    if (key === this.upgradeListKey) return;
    this.upgradeListKey = key;
    this.upgradeEntries = upgrades;
    this.upgradeList = upgrades ? this.renderUpgradeList(upgrades) : undefined;
  }

  drawLive(ctx: Context2D): void {
    const totals = this.totals;
    if (totals && this.gameMode !== GameMode.DeathMatch) this.drawScoreTotal(ctx, totals);
    if (totals) this.drawRespawnCountdown(ctx, totals);
    if (totals?.latencyMs !== undefined) this.drawPing(ctx, totals.latencyMs);
    for (const label of this.labels) {
      if (!label.visible) continue;
      const bitmap = this.playerClip(label);
      if (bitmap) blit(ctx, bitmap, label.screen, 1, OPAQUE_ALPHA, this.currentResolution);
      const name = label.name ? this.textClip({ text: label.name, color: label.local ? LOCAL_PLAYER_NAME_COLOR : OTHER_PLAYER_NAME_COLOR, fontPx: PLAYER_NAME_FONT_PX, boxWidthPx: PLAYER_NAME_BOX_WIDTH_PX, rightAligned: false }) : undefined;
      if (name) blit(ctx, name, { x: label.screen.x, y: label.screen.y + PLAYER_NAME_OFFSET_Y_PX }, 1, OPAQUE_ALPHA, this.currentResolution);
    }
    const panel = this.panelSurface();
    if (panel) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(panel.canvas, 0, 0);
    }
    resetContext(ctx);
  }

  hitTest(point: Point2): HudAction | undefined {
    if (this.panelShown && this.childButtonContains(HudSymbol.UpgradeList, HudChild.Quit, point)) return HudAction.Quit;
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
    const texts: Overrides = {
      [HudChild.ScoreText]: { text: padNumber(totals.totalScore, SCORE_DIGITS) },
      [HudChild.MultiplierText]: { text: t('hud.multiplier', { multiplier: totals.multiplier }) },
      [HudChild.Timer]: { visible: false },
    };
    const textsKey = `total|${totals.totalScore}|${totals.multiplier}`;
    const timerFrame = timerFrameIndex(totals.multiplierTickRatio, this.childFrameCount(HudSymbol.ScoreTotal, HudChild.Timer));
    const timer: Overrides = {
      [HudChild.ScoreText]: { visible: false },
      [HudChild.MultiplierText]: { visible: false },
      [HudChild.Timer]: { frame: timerFrame },
    };
    this.blitScoreTotal(ctx, texts, textsKey);
    this.blitScoreTotal(ctx, timer, `timer|${timerFrame}`);
  }

  private blitScoreTotal(ctx: Context2D, overrides: Overrides, key: string): void {
    const bitmap = this.clip(HudSymbol.ScoreTotal, overrides, key, LIVE_CLIP_INFLATE_PX);
    if (bitmap) blit(ctx, bitmap, SCORE_TOTAL_POSITION, 1, OPAQUE_ALPHA, this.currentResolution);
  }

  private drawRespawnCountdown(ctx: Context2D, totals: HudFrame): void {
    const ticks = totals.players.find((player) => player.playerIndex === totals.localPlayerIndex)?.status.respawnTicks;
    if (ticks === undefined) return;
    const text = t('hud.respawn', { seconds: respawnSeconds(ticks, this.ticksPerSecond) });
    const overrides: Overrides = { [HudChild.MessageText]: { text, textColor: RESPAWN_TEXT_COLOR } };
    const bitmap = this.clip(HudSymbol.Message, overrides, `respawn|${text}`, HUD_BUFFER_INFLATE_PX, RESPAWN_TEXT_SCALE);
    if (bitmap) blit(ctx, bitmap, RESPAWN_TEXT_POSITION, 1, OPAQUE_ALPHA, this.currentResolution);
  }

  private playerClip(label: PlayerLabel): BufferedBitmap | undefined {
    const lifeFrame = lifeFrameIndex(label.lifeRatio, this.childFrameCount(HudSymbol.Player, HudChild.Life));
    const overrides: Overrides = {
      [HudChild.Life]: { frame: lifeFrame },
      [HudChild.Ammo]: { frame: 0, children: { [HudChild.AmmoText]: { text: label.text, letterSpacing: AMMO_LETTER_SPACING_PX } } },
    };
    return this.clip(HudSymbol.Player, overrides, `player|${lifeFrame}|${label.text}`, LIVE_CLIP_INFLATE_PX);
  }

  private drawPing(ctx: Context2D, latencyMs: number): void {
    const text = t('hud.ping', { ms: latencyMs });
    const bitmap = this.textClip({ text, color: pingColor(latencyMs), fontPx: PING_FONT_PX, boxWidthPx: PING_BOX_WIDTH_PX, rightAligned: true });
    if (bitmap) blit(ctx, bitmap, PING_POSITION, 1, OPAQUE_ALPHA, this.currentResolution);
  }

  private textClip(look: TextClipLook): BufferedBitmap | undefined {
    const { text: name, color } = look;
    const key = `text|${look.rightAligned}|${look.fontPx}|${color}|${name}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const library = this.renderer.library;
    const playerId = library.characterId(HudSymbol.Player);
    const ammo = playerId === undefined ? undefined : library.findChild(playerId, HudChild.Ammo);
    const template = ammo ? library.findChild(ammo.characterId, HudChild.AmmoText) : undefined;
    const character = template ? library.character(template.characterId) : undefined;
    if (!template || character?.kind !== 'editText') return undefined;
    const { bounds, fontSize } = character.editText;
    const scale = look.fontPx / (fontSize ?? look.fontPx);
    const center = (bounds.xMin + bounds.xMax) / 2;
    const width = look.boxWidthPx / scale;
    const anchor = look.rightAligned ? bounds.xMax : center;
    const textBounds: Rect = look.rightAligned ? { ...bounds, xMin: anchor - width, xMax: anchor } : { ...bounds, xMin: center - width / 2, xMax: center + width / 2 };
    const item: DisplayItem = {
      depth: 1,
      characterId: template.characterId,
      instance: 0,
      matrix: [scale, 0, 0, scale, -anchor * scale, 0],
      name: PLAYER_NAME_CHILD,
      ...(template.filters ? { filters: template.filters } : {}),
    };
    const resolution = this.currentResolution;
    const layout = bufferLayout(transformRect(textBounds, item.matrix), 1, 1, LIVE_CLIP_INFLATE_PX, resolution);
    const surface = this.renderer.createSurface(layout.width, layout.height);
    this.renderer.drawItems(surface.ctx, [item], layout.matrix, { overrides: { [PLAYER_NAME_CHILD]: { text: name, textColor: color, textBounds, ...(look.rightAligned ? { textAlign: RIGHT } : {}) } }, resolution });
    const bitmap = { surface, dispX: layout.dispX, dispY: layout.dispY };
    this.cache.set(key, bitmap);
    return bitmap;
  }

  private childFrameCount(symbol: string, child: string): number {
    const library = this.renderer.library;
    const id = library.characterId(symbol);
    const item = id === undefined ? undefined : library.findChild(id, child);
    return (item ? library.sprite(item.characterId)?.frameCount : undefined) ?? 1;
  }

  private clip(symbol: string, overrides: Overrides, key: string, inflatePx: number, scale = 1): BufferedBitmap | undefined {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const id = this.renderer.library.characterId(symbol);
    if (id === undefined) return undefined;
    const resolution = this.currentResolution;
    const layout = bufferLayout(this.renderer.library.localBounds(id, 0, overrides), scale, scale, inflatePx, resolution);
    const surface = this.renderer.createSurface(layout.width, layout.height);
    this.renderer.draw(surface.ctx, id, 0, layout.matrix, { overrides, resolution });
    const bitmap = { surface, dispX: layout.dispX, dispY: layout.dispY };
    this.cache.set(key, bitmap);
    return bitmap;
  }

  private panelSurface(): Surface | undefined {
    if (!this.panelShown) return undefined;
    const totals = this.totals;
    if (this.gameMode !== GameMode.DeathMatch) return this.upgradeList;
    if (!totals) return undefined;
    const rows = scoreboardRows(totals, (playerIndex) => playerDisplayName(totals, playerIndex));
    const key = JSON.stringify(rows);
    if (this.scoreboard?.key !== key) this.scoreboard = { key, surface: this.renderScoreboard(rows) };
    return this.scoreboard.surface;
  }

  private panelBase(hiddenKeys: readonly string[]): { readonly id: number; readonly surface: Surface; readonly toDevice: Matrix } | undefined {
    const id = this.renderer.library.characterId(HudSymbol.UpgradeList);
    if (id === undefined) return undefined;
    const resolution = this.currentResolution;
    const toDevice = scaling(resolution, resolution);
    const surface = this.renderer.createSurface(SCREEN_WIDTH_PX * resolution, SCREEN_HEIGHT_PX * resolution);
    const hidden: Overrides = Object.fromEntries([...UPGRADE_COLUMNS, ...hiddenKeys].map((key) => [key, { visible: false }]));
    this.renderer.draw(surface.ctx, id, 0, toDevice, { overrides: hidden, resolution });
    return { id, surface, toDevice };
  }

  private drawPanelRow(base: { readonly id: number; readonly surface: Surface; readonly toDevice: Matrix }, column: string, row: number, overrides: Overrides, alpha: number): void {
    const template = this.renderer.library.findChild(base.id, column);
    if (!template) return;
    const matrix: Matrix = multiply(base.toDevice, flashTranslate(template.matrix, 0, row * UPGRADE_ROW_SPACING_PX));
    this.renderer.draw(base.surface.ctx, template.characterId, 0, matrix, { overrides, colorTransform: alphaOnly(alpha), resolution: this.currentResolution });
  }

  private renderUpgradeList(upgrades: readonly MultiplierListEntry[]): Surface | undefined {
    const base = this.panelBase([depthKey(PAUSED_TITLE_DEPTH)]);
    if (!base) return undefined;
    for (const { entry, column, row } of upgradeRows(upgrades)) {
      const overrides: Overrides = {
        [HudChild.UpgradeText]: { text: t(entry.name), textColor: entry.newWeapon ? NEW_WEAPON_UPGRADE_COLOR : UPGRADE_COLOR },
        [HudChild.UpgradeIndex]: { text: String(entry.index) },
      };
      this.drawPanelRow(base, column, row, overrides, entry.active ? OPAQUE : INACTIVE_UPGRADE_ALPHA);
    }
    return base.surface;
  }

  private renderScoreboard(rows: readonly ScoreboardRow[]): Surface | undefined {
    const base = this.panelBase([depthKey(PAUSED_TITLE_DEPTH), depthKey(UPGRADE_LIST_TITLE_DEPTH)]);
    if (!base) return undefined;
    const titleId = this.renderer.library.characterId(HudSymbol.Message);
    const titleOverrides: Overrides = { [HudChild.MessageText]: { text: t('hud.scoreboard.title'), textColor: UPGRADE_COLOR } };
    const { x, y } = SCOREBOARD_TITLE_POSITION;
    if (titleId !== undefined) this.renderer.draw(base.surface.ctx, titleId, 0, multiply(base.toDevice, [1, 0, 0, 1, x, y]), { overrides: titleOverrides, resolution: this.currentResolution });
    rows.forEach((entry, row) => {
      const color = entry.local ? LOCAL_PLAYER_NAME_COLOR : UPGRADE_COLOR;
      const cells: readonly (readonly [string, string])[] = [
        [String(entry.rank), entry.name],
        [String(entry.kills), t('hud.scoreboard.kills')],
        [String(entry.deaths), t('hud.scoreboard.deaths')],
      ];
      cells.forEach(([index, text], column) => {
        const name = SCOREBOARD_COLUMNS[column];
        if (name === undefined) return;
        this.drawPanelRow(base, name, row, { [HudChild.UpgradeText]: { text, textColor: color }, [HudChild.UpgradeIndex]: { text: index } }, OPAQUE);
      });
    });
    return base.surface;
  }
}
