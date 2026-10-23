import type { Point2 } from '../../../domain/events.ts';
import type { HudMessageEntry } from '../../../domain/hud/HudState.ts';
import type { MultiplierListEntry } from '../../../domain/upgrades/Upgrades.ts';
import { OPAQUE_ALPHA } from '../../../domain/visuals.ts';
import {
  MESSAGE_FADE_DIVISOR,
  MESSAGE_FADE_START_MS,
  MESSAGE_MOVE_FRACTION,
  MESSAGE_PUSH_PX,
  MESSAGE_START_MOVE_PX,
  MS_PER_SECOND,
  PAD_CHARACTER,
  SCORE_POPUP_ACCELERATION,
  SCORE_POPUP_FADE_OFFSET,
  SCORE_POPUP_FADE_START_Y,
  SCORE_POPUP_SPEED_PX,
  UPGRADE_COLUMNS,
} from './tuning.ts';

export function padNumber(value: number, digits: number): string {
  return String(value).padStart(digits, PAD_CHARACTER);
}

export function lifeFrameIndex(lifeRatio: number, totalFrames: number): number {
  const oneBased = Math.min(Math.max(1, totalFrames * lifeRatio + 1), totalFrames);
  return Math.floor(oneBased) - 1;
}

export function timerFrameIndex(ratio: number, totalFrames: number): number {
  return Math.min(Math.max(0, Math.floor(ratio * totalFrames)), totalFrames - 1);
}

export interface ScorePopup {
  readonly points: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface PopupDraw {
  readonly popup: ScorePopup;
  readonly alpha: number;
}

export function normalizeTo(dx: number, dy: number, length: number): Point2 {
  const current = Math.hypot(dx, dy);
  return current === 0 ? { x: 0, y: 0 } : { x: (dx / current) * length, y: (dy / current) * length };
}

export class ScorePopups {
  private popups: ScorePopup[] = [];

  get count(): number {
    return this.popups.length;
  }

  add(points: number, screen: Point2, target: Point2): void {
    const delta = normalizeTo(target.x - screen.x, target.y - screen.y, SCORE_POPUP_SPEED_PX);
    this.popups.push({ points, x: screen.x, y: screen.y, dx: delta.x, dy: delta.y });
  }

  step(): PopupDraw[] {
    const draws: PopupDraw[] = [];
    for (const popup of this.popups) {
      popup.x += popup.dx;
      popup.y += popup.dy;
      popup.dx *= SCORE_POPUP_ACCELERATION;
      popup.dy *= SCORE_POPUP_ACCELERATION;
      const alpha = popup.y < SCORE_POPUP_FADE_START_Y ? popup.y - SCORE_POPUP_FADE_OFFSET : OPAQUE_ALPHA;
      draws.push({ popup, alpha });
    }
    this.popups = this.popups.filter((popup) => popup.y > 0);
    return draws;
  }

  clear(): void {
    this.popups = [];
  }
}

interface MessageState {
  readonly entry: HudMessageEntry;
  y: number;
  moveCount: number;
}

export interface MessageDraw {
  readonly entry: HudMessageEntry;
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
}

export function messageAlpha(ageMs: number): number {
  return ageMs < MESSAGE_FADE_START_MS ? OPAQUE_ALPHA : OPAQUE_ALPHA - (ageMs - MESSAGE_FADE_START_MS) / MESSAGE_FADE_DIVISOR;
}

export class MessageTrack {
  private states: MessageState[] = [];

  constructor(private readonly origin: Point2) {}

  sync(entries: readonly HudMessageEntry[]): void {
    const live = new Set(entries);
    this.states = this.states.filter((state) => live.has(state.entry));
    const known = new Set(this.states.map((state) => state.entry));
    for (const entry of entries) {
      if (known.has(entry)) continue;
      for (const state of this.states) state.moveCount += MESSAGE_PUSH_PX;
      this.states.push({ entry, y: this.origin.y, moveCount: MESSAGE_START_MOVE_PX });
    }
  }

  step(tick: number, ticksPerSecond: number): MessageDraw[] {
    return this.states.map((state) => {
      if (state.moveCount > 0) {
        const move = state.moveCount * MESSAGE_MOVE_FRACTION;
        state.y -= move;
        state.moveCount -= move;
      }
      const ageMs = ((tick - state.entry.tick) * MS_PER_SECOND) / ticksPerSecond;
      return { entry: state.entry, x: this.origin.x, y: state.y, alpha: messageAlpha(ageMs) };
    });
  }
}

export interface UpgradeRow {
  readonly entry: MultiplierListEntry;
  readonly column: (typeof UPGRADE_COLUMNS)[number];
  readonly row: number;
}

export function upgradeRows(entries: readonly MultiplierListEntry[]): UpgradeRow[] {
  const perColumn = Math.ceil(entries.length / UPGRADE_COLUMNS.length);
  const rows: UpgradeRow[] = [];
  let row = 0;
  let column = 0;
  for (const entry of entries) {
    const name = UPGRADE_COLUMNS[Math.min(column, UPGRADE_COLUMNS.length - 1)] ?? UPGRADE_COLUMNS[0];
    rows.push({ entry, column: name, row });
    row++;
    if (row > perColumn) {
      column++;
      row = 0;
    }
  }
  return rows;
}
