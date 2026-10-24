const DIGIT_ZERO_KEY_CODE = 48;
const DIGIT_NINE_KEY_CODE = 57;
const LETTER_A_KEY_CODE = 65;
const LETTER_Z_KEY_CODE = 90;
const NUMPAD_ZERO_KEY_CODE = 96;
const NUMPAD_NINE_KEY_CODE = 105;

export const TAB_KEY_CODE = 9;
export const BACKQUOTE_KEY_CODE = 192;

const NAMED_KEY_CODES: Readonly<Record<number, string>> = {
  [TAB_KEY_CODE]: 'Tab',
  32: 'Space',
  33: 'PageUp',
  34: 'PageDown',
  35: 'End',
  36: 'Home',
  37: 'ArrowLeft',
  38: 'ArrowUp',
  39: 'ArrowRight',
  40: 'ArrowDown',
  45: 'Insert',
  46: 'Delete',
  106: 'NumpadMultiply',
  107: 'NumpadAdd',
  109: 'NumpadSubtract',
  110: 'NumpadDecimal',
  111: 'NumpadDivide',
  186: 'Semicolon',
  187: 'Equal',
  188: 'Comma',
  189: 'Minus',
  190: 'Period',
  191: 'Slash',
  [BACKQUOTE_KEY_CODE]: 'Backquote',
  219: 'BracketLeft',
  220: 'Backslash',
  221: 'BracketRight',
  222: 'Quote',
};

export function codeForKeyCode(keyCode: number): string | undefined {
  if (keyCode >= DIGIT_ZERO_KEY_CODE && keyCode <= DIGIT_NINE_KEY_CODE) return `Digit${keyCode - DIGIT_ZERO_KEY_CODE}`;
  if (keyCode >= LETTER_A_KEY_CODE && keyCode <= LETTER_Z_KEY_CODE) return `Key${String.fromCharCode(keyCode)}`;
  if (keyCode >= NUMPAD_ZERO_KEY_CODE && keyCode <= NUMPAD_NINE_KEY_CODE) return `Numpad${keyCode - NUMPAD_ZERO_KEY_CODE}`;
  return NAMED_KEY_CODES[keyCode];
}

export function asciiKeyCode(character: string): number {
  return character.charCodeAt(0);
}
