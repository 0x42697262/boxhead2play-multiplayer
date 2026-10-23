import type { TextKey } from '../../text/i18n.ts';
import { codeForKeyCode } from './keyCodes.ts';

export interface ValidKey {
  readonly valid: boolean;
  readonly name: TextKey;
}

export const ESCAPE_KEY_CODE = 27;

export const VALID_KEYS: ReadonlyMap<number, ValidKey> = new Map<number, ValidKey>([
  [38, { valid: true, name: 'key.name.38' }],
  [40, { valid: true, name: 'key.name.40' }],
  [37, { valid: true, name: 'key.name.37' }],
  [39, { valid: true, name: 'key.name.39' }],
  [111, { valid: true, name: 'key.name.111' }],
  [106, { valid: true, name: 'key.name.106' }],
  [109, { valid: true, name: 'key.name.109' }],
  [107, { valid: true, name: 'key.name.107' }],
  [110, { valid: true, name: 'key.name.110' }],
  [96, { valid: true, name: 'key.name.96' }],
  [97, { valid: true, name: 'key.name.97' }],
  [98, { valid: true, name: 'key.name.98' }],
  [99, { valid: true, name: 'key.name.99' }],
  [100, { valid: true, name: 'key.name.100' }],
  [101, { valid: true, name: 'key.name.101' }],
  [102, { valid: true, name: 'key.name.102' }],
  [103, { valid: true, name: 'key.name.103' }],
  [104, { valid: true, name: 'key.name.104' }],
  [105, { valid: true, name: 'key.name.105' }],
  [65, { valid: true, name: 'key.name.65' }],
  [66, { valid: true, name: 'key.name.66' }],
  [67, { valid: true, name: 'key.name.67' }],
  [68, { valid: true, name: 'key.name.68' }],
  [69, { valid: true, name: 'key.name.69' }],
  [70, { valid: true, name: 'key.name.70' }],
  [71, { valid: true, name: 'key.name.71' }],
  [72, { valid: true, name: 'key.name.72' }],
  [73, { valid: true, name: 'key.name.73' }],
  [74, { valid: true, name: 'key.name.74' }],
  [75, { valid: true, name: 'key.name.75' }],
  [76, { valid: true, name: 'key.name.76' }],
  [77, { valid: true, name: 'key.name.77' }],
  [78, { valid: true, name: 'key.name.78' }],
  [79, { valid: true, name: 'key.name.79' }],
  [81, { valid: true, name: 'key.name.81' }],
  [82, { valid: true, name: 'key.name.82' }],
  [83, { valid: true, name: 'key.name.83' }],
  [84, { valid: true, name: 'key.name.84' }],
  [85, { valid: true, name: 'key.name.85' }],
  [86, { valid: true, name: 'key.name.86' }],
  [87, { valid: true, name: 'key.name.87' }],
  [88, { valid: true, name: 'key.name.88' }],
  [89, { valid: true, name: 'key.name.89' }],
  [90, { valid: true, name: 'key.name.90' }],
  [32, { valid: true, name: 'key.name.32' }],
  [188, { valid: true, name: 'key.name.188' }],
  [190, { valid: true, name: 'key.name.190' }],
  [191, { valid: true, name: 'key.name.191' }],
  [220, { valid: true, name: 'key.name.220' }],
  [189, { valid: true, name: 'key.name.189' }],
  [187, { valid: true, name: 'key.name.187' }],
  [46, { valid: true, name: 'key.name.46' }],
  [36, { valid: true, name: 'key.name.36' }],
  [35, { valid: true, name: 'key.name.35' }],
  [33, { valid: true, name: 'key.name.33' }],
  [34, { valid: true, name: 'key.name.34' }],
  [45, { valid: true, name: 'key.name.45' }],
  [0, { valid: false, name: 'key.name.0' }],
  [186, { valid: false, name: 'key.name.186' }],
  [192, { valid: false, name: 'key.name.192' }],
  [222, { valid: false, name: 'key.name.222' }],
  [219, { valid: false, name: 'key.name.219' }],
  [221, { valid: false, name: 'key.name.221' }],
]);

export function validKey(keyCode: number): ValidKey | undefined {
  return VALID_KEYS.get(keyCode);
}

const KEY_CODE_LIMIT = 256;

const KEY_CODE_BY_CODE: ReadonlyMap<string, number> = new Map(
  Array.from({ length: KEY_CODE_LIMIT }, (_, keyCode) => [codeForKeyCode(keyCode), keyCode] as const).filter((entry): entry is readonly [string, number] => entry[0] !== undefined),
);

const ESCAPE_CODE = 'Escape';

export function keyCodeForCode(code: string): number | undefined {
  return code === ESCAPE_CODE ? ESCAPE_KEY_CODE : KEY_CODE_BY_CODE.get(code);
}
