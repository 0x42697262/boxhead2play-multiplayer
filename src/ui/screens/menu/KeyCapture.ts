import { ESCAPE_KEY_CODE, validKey } from '../../../adapters/input/validKeys.ts';
import type { KeyField, PlayerSlot } from '../../../services/menuSettings.ts';
import { INVALID_KEY_PHASE_MS } from './tuning.ts';

export interface KeyTarget {
  readonly slot: PlayerSlot;
  readonly field: KeyField;
}

export const KeyPressOutcome = {
  Cancelled: 'cancelled',
  Assigned: 'assigned',
  Ignored: 'ignored',
  Invalid: 'invalid',
} as const;

export type KeyPressOutcome = (typeof KeyPressOutcome)[keyof typeof KeyPressOutcome];

export type KeyPressResult =
  | { readonly outcome: typeof KeyPressOutcome.Assigned; readonly target: KeyTarget; readonly keyCode: number }
  | { readonly outcome: Exclude<KeyPressOutcome, typeof KeyPressOutcome.Assigned> };

export interface KeyPromptDisplay {
  readonly pressAKeyAlpha: number;
  readonly invalidVisible: boolean;
  readonly invalidAlpha: number;
}

const OPAQUE = 1;
const HIDDEN = 0;
const IDLE_DISPLAY: KeyPromptDisplay = { pressAKeyAlpha: OPAQUE, invalidVisible: false, invalidAlpha: OPAQUE };

export function invalidKeyDisplay(elapsedMs: number): KeyPromptDisplay {
  const fade = Math.min(elapsedMs / INVALID_KEY_PHASE_MS - 1, 1);
  if (fade >= 1) return IDLE_DISPLAY;
  if (fade > 0) return { pressAKeyAlpha: fade, invalidVisible: true, invalidAlpha: OPAQUE - fade };
  return { pressAKeyAlpha: HIDDEN, invalidVisible: true, invalidAlpha: OPAQUE };
}

export class KeyCapture {
  private waiting: KeyTarget | undefined = undefined;
  private invalidAtMs: number | undefined = undefined;

  get active(): boolean {
    return this.waiting !== undefined;
  }

  get target(): KeyTarget | undefined {
    return this.waiting;
  }

  begin(target: KeyTarget): void {
    this.waiting = target;
    this.invalidAtMs = undefined;
  }

  press(keyCode: number | undefined, nowMs: number): KeyPressResult {
    const target = this.waiting;
    if (!target) return { outcome: KeyPressOutcome.Ignored };
    if (keyCode === ESCAPE_KEY_CODE) {
      this.waiting = undefined;
      return { outcome: KeyPressOutcome.Cancelled };
    }
    const key = keyCode === undefined ? undefined : validKey(keyCode);
    if (!key || keyCode === undefined) {
      this.invalidAtMs = nowMs;
      return { outcome: KeyPressOutcome.Invalid };
    }
    if (!key.valid) return { outcome: KeyPressOutcome.Ignored };
    this.waiting = undefined;
    return { outcome: KeyPressOutcome.Assigned, target, keyCode };
  }

  display(nowMs: number): KeyPromptDisplay {
    if (this.invalidAtMs === undefined) return IDLE_DISPLAY;
    const display = invalidKeyDisplay(nowMs - this.invalidAtMs);
    if (!display.invalidVisible) this.invalidAtMs = undefined;
    return display;
  }
}
