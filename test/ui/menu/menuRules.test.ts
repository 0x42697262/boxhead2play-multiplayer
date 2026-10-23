import { describe, expect, it } from 'vitest';
import type { GlyphPlacement } from '../../../src/adapters/assets/schemas.ts';
import { ESCAPE_KEY_CODE, keyCodeForCode, validKey, VALID_KEYS } from '../../../src/adapters/input/validKeys.ts';
import { ButtonState } from '../../../src/adapters/render/symbols/SymbolLibrary.ts';
import { SequenceRng } from '../../../src/domain/math/Rng.ts';
import { PlayerSlot } from '../../../src/services/menuSettings.ts';
import { Cursor, PointerPhase } from '../../../src/services/ScreenFlow.ts';
import { t } from '../../../src/text/i18n.ts';
import { cycleFrame } from '../../../src/ui/screens/menu/frameCycle.ts';
import { invalidKeyDisplay, KeyCapture, KeyPressOutcome } from '../../../src/ui/screens/menu/KeyCapture.ts';
import { wordCut } from '../../../src/ui/screens/menu/labelWord.ts';
import { MenuPointer, Trigger, type MenuTarget } from '../../../src/ui/screens/menu/MenuPointer.ts';
import { rollOverFilters } from '../../../src/ui/screens/menu/rollOver.ts';
import { ScreenTransition } from '../../../src/ui/screens/menu/ScreenTransition.ts';

const SINGLE_PLAY: readonly GlyphPlacement[] = [
  { char: 'S', x: 83.6, advance: 7.2 },
  { char: 'I', x: 90.8, advance: 3.7 },
  { char: 'N', x: 94.5, advance: 8.15 },
  { char: 'G', x: 102.65, advance: 8.45 },
  { char: 'L', x: 111.1, advance: 6.6 },
  { char: 'E', x: 117.7, advance: 7.2 },
  { char: ' ', x: 124.9, advance: 3.05 },
  { char: 'P', x: 127.95, advance: 7.2 },
  { char: 'L', x: 135.15, advance: 6.6 },
  { char: 'A', x: 141.75, advance: 7.75 },
  { char: 'Y', x: 149.5, advance: 6.8 },
];
const SINGLE_PLAY_BOUNDS = { xMin: 84.4, yMin: 0.1, xMax: 161.25, yMax: 10.55 };

describe('mcGotoFrame wraparound', () => {
  it('steps through the frames and wraps both ways', () => {
    expect(cycleFrame(0, 1, 4)).toBe(1);
    expect(cycleFrame(3, 1, 4)).toBe(0);
    expect(cycleFrame(0, -1, 18)).toBe(17);
    expect(cycleFrame(20, 0, 18)).toBe(2);
    expect(cycleFrame(5, 0, 0)).toBe(0);
  });
});

describe('PLAY label cut out of "SINGLE PLAY"', () => {
  it('clips from the space before PLAY to the end of the text and centers the word on the label', () => {
    const cut = wordCut(SINGLE_PLAY, SINGLE_PLAY_BOUNDS, 1);
    expect(cut?.clip).toEqual({ xMin: 124.9, yMin: 0.1, xMax: 161.25, yMax: 10.55 });
    const labelCenter = (83.6 + 156.3) / 2;
    const wordCenter = (127.95 + 156.3) / 2;
    expect(cut?.offsetX).toBeCloseTo(labelCenter - wordCenter);
    expect(cut?.offsetX).toBeCloseTo(-22.175);
  });

  it('starts the first word at the text bounds and rejects missing words', () => {
    expect(wordCut(SINGLE_PLAY, SINGLE_PLAY_BOUNDS, 0)?.clip.xMin).toBe(84.4);
    expect(wordCut(SINGLE_PLAY, SINGLE_PLAY_BOUNDS, 0)?.clip.xMax).toBe(127.95);
    expect(wordCut(SINGLE_PLAY, SINGLE_PLAY_BOUNDS, 2)).toBeUndefined();
  });
});

describe('Register_Button roll-over filters', () => {
  it('draws distance, angle and blur in the original order with Flash defaults', () => {
    const [shadow, blur] = rollOverFilters(new SequenceRng([0.5, 0.25, 0.5, 1 / 4]));
    expect(shadow).toMatchObject({ type: 'dropShadow', distance: 1.5, blurX: 4, blurY: 4, strength: 1, passes: 1, dropShadowColor: { r: 0, g: 0, b: 0, a: 255 } });
    expect(shadow?.angle).toBeCloseTo(Math.PI / 2);
    expect(blur).toEqual({ type: 'blur', blurX: 1, blurY: 0.5, passes: 1 });
  });
});

describe('CInput valid keys', () => {
  it('keeps the original table: names, invalid entries and missing keys', () => {
    expect(VALID_KEYS.size).toBe(63);
    expect(t(validKey(38)?.name ?? 'app.title')).toBe('ARROW UP');
    expect(t(validKey(32)?.name ?? 'app.title')).toBe("' '");
    expect(validKey(186)?.valid).toBe(false);
    expect(validKey(80)).toBeUndefined();
    expect(validKey(49)).toBeUndefined();
    expect(validKey(20)).toBeUndefined();
  });

  it('maps KeyboardEvent.code back to legacy key codes', () => {
    expect(keyCodeForCode('ArrowUp')).toBe(38);
    expect(keyCodeForCode('KeyK')).toBe(75);
    expect(keyCodeForCode('Numpad5')).toBe(101);
    expect(keyCodeForCode('Slash')).toBe(191);
    expect(keyCodeForCode('Escape')).toBe(ESCAPE_KEY_CODE);
    expect(keyCodeForCode('Enter')).toBeUndefined();
  });
});

describe('key rebinding (Activate_WaitForKeypress)', () => {
  const target = { slot: PlayerSlot.Second, field: 'fire' } as const;

  it('assigns a valid key, ignores known invalid keys and cancels on escape', () => {
    const capture = new KeyCapture();
    capture.begin(target);
    expect(capture.press(186, 0)).toEqual({ outcome: KeyPressOutcome.Ignored });
    expect(capture.active).toBe(true);
    expect(capture.press(75, 0)).toEqual({ outcome: KeyPressOutcome.Assigned, target, keyCode: 75 });
    expect(capture.active).toBe(false);
    capture.begin(target);
    expect(capture.press(ESCAPE_KEY_CODE, 0)).toEqual({ outcome: KeyPressOutcome.Cancelled });
    expect(capture.active).toBe(false);
  });

  it('shows INVALID KEY for keys outside the table, then cross-fades back to PRESS A KEY', () => {
    const capture = new KeyCapture();
    capture.begin(target);
    expect(capture.press(undefined, 1000)).toEqual({ outcome: KeyPressOutcome.Invalid });
    expect(capture.press(80, 1000)).toEqual({ outcome: KeyPressOutcome.Invalid });
    expect(capture.display(1200)).toEqual({ pressAKeyAlpha: 0, invalidVisible: true, invalidAlpha: 1 });
    expect(capture.display(1750).invalidAlpha).toBeCloseTo(0.5);
    expect(capture.display(2000)).toEqual({ pressAKeyAlpha: 1, invalidVisible: false, invalidAlpha: 1 });
    expect(capture.display(2100).invalidVisible).toBe(false);
    expect(invalidKeyDisplay(250).pressAKeyAlpha).toBe(0);
  });
});

describe('menu pointer', () => {
  const play: MenuTarget<string> = { path: ['play'], trigger: Trigger.Release, action: 'play' };
  const back: MenuTarget<string> = { path: ['back'], trigger: Trigger.Press, action: 'back' };
  const lock: MenuTarget<string> = { path: ['lock'], trigger: Trigger.Block };
  const hitAt = (x: number) => () => (x < 10 ? play : x < 20 ? back : x < 30 ? lock : undefined);
  const at = (phase: (typeof PointerPhase)[keyof typeof PointerPhase], x: number) => ({ phase, point: { x, y: 0 } });

  it('fires release targets only when released over the pressed target', () => {
    const pointer = new MenuPointer<string>();
    expect(pointer.handle(at(PointerPhase.Down, 5), hitAt(5))).toBeUndefined();
    expect(pointer.buttonState(['play'])).toBe(ButtonState.Down);
    expect(pointer.handle(at(PointerPhase.Up, 5), hitAt(5))).toBe('play');
    pointer.handle(at(PointerPhase.Down, 5), hitAt(5));
    expect(pointer.handle(at(PointerPhase.Up, 40), hitAt(40))).toBeUndefined();
  });

  it('fires press targets on press, shows the hand only over clickable targets', () => {
    const pointer = new MenuPointer<string>();
    expect(pointer.handle(at(PointerPhase.Down, 15), hitAt(15))).toBe('back');
    pointer.handle(at(PointerPhase.Up, 15), hitAt(15));
    expect(pointer.cursor).toBe(Cursor.Hand);
    pointer.handle(at(PointerPhase.Move, 25), hitAt(25));
    expect(pointer.cursor).toBe(Cursor.Default);
    expect(pointer.buttonState(['play'])).toBe(ButtonState.Up);
    pointer.handle(at(PointerPhase.Move, 5), hitAt(5));
    expect(pointer.buttonState(['play'])).toBe(ButtonState.Over);
    pointer.handle(at(PointerPhase.Leave, 5), hitAt(5));
    expect(pointer.hoveredTarget).toBeUndefined();
  });
});

describe('CScreen_Transition cross-fade', () => {
  it('adds 10 % per screen process (every second menu tick) and finishes after 10 steps', () => {
    const transition = new ScreenTransition(undefined);
    expect(transition.incomingAlpha).toBe(0);
    transition.tick();
    expect(transition.incomingAlpha).toBeCloseTo(0.1);
    transition.tick();
    expect(transition.incomingAlpha).toBeCloseTo(0.1);
    for (let tick = 0; tick < 16; tick++) transition.tick();
    expect(transition.done).toBe(false);
    transition.tick();
    expect(transition.done).toBe(true);
  });
});
